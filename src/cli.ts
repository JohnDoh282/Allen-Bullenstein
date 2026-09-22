import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { loadConfig } from "./config.js";
import type { HolderSnapshot } from "./domain.js";
import { executePlan } from "./executor.js";
import { LedgerStore } from "./ledger.js";
import { createDistributionPlan } from "./planner.js";
import { buildHolderSnapshot } from "./snapshot.js";
import { fundReflectionTreasury } from "./funder.js";
import {
  getCreatorRewardsBalance,
  loadStoredBuyEvents,
  scanFinalizedBuyVolume,
  summarizeBuyVolume,
  watchFinalizedBuys
} from "./ingestion.js";

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const config = loadConfig();
  const flags = readFlags(args);

  if (command === "snapshot") {
    const snapshot = await buildHolderSnapshot(config);
    const directory = join(config.dataDir, "snapshots");
    await mkdir(directory, { recursive: true });
    const path = join(directory, `${snapshot.id}.json`);
    await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ snapshotId: snapshot.id, path, holders: snapshot.holders.length, finalizedSlot: snapshot.finalizedSlot }, null, 2));
    return;
  }

  if (command === "ingest") {
    const pages = flags.pages ? parsePositiveInt(flags.pages, "--pages") : 5;
    const pageSize = flags["page-size"] ? parsePositiveInt(flags["page-size"], "--page-size") : 1000;

    if (flags.watch === "true") {
      const stop = await watchFinalizedBuys(config, (event) => {
        console.log(JSON.stringify({ type: "buy", ...event }));
      });
      console.log(JSON.stringify({ status: "watching", mint: config.mint, commitment: "finalized" }, null, 2));
      const shutdown = async () => { await stop(); process.exit(0); };
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
      await new Promise<void>(() => undefined);
      return;
    }

    await scanFinalizedBuyVolume(config, {
      pages,
      pageSize,
      before: flags.before
    });
    const stored = await loadStoredBuyEvents(config);
    const summary = summarizeBuyVolume(config.mint, stored, {
      fromSlot: flags["from-slot"] ? parsePositiveInt(flags["from-slot"], "--from-slot") : undefined,
      toSlot: flags["to-slot"] ? parsePositiveInt(flags["to-slot"], "--to-slot") : undefined
    });
    console.log(JSON.stringify({
      mint: summary.mint,
      eventCount: summary.eventCount,
      buyVolumeLamports: summary.buyVolumeLamports,
      reflectionRateBps: summary.reflectionRateBps,
      reflectionPoolLamports: summary.reflectionPoolLamports,
      fromSlot: flags["from-slot"] ?? null,
      toSlot: flags["to-slot"] ?? null
    }, null, 2));
    return;
  }

  if (command === "fund-auto") {
    const pages = flags.pages ? parsePositiveInt(flags.pages, "--pages") : 5;
    const pageSize = flags["page-size"] ? parsePositiveInt(flags["page-size"], "--page-size") : 1000;

    await scanFinalizedBuyVolume(config, {
      pages,
      pageSize,
      before: flags.before
    });
    const stored = await loadStoredBuyEvents(config);
    const summary = summarizeBuyVolume(config.mint, stored, {
      fromSlot: flags["from-slot"] ? parsePositiveInt(flags["from-slot"], "--from-slot") : undefined,
      toSlot: flags["to-slot"] ? parsePositiveInt(flags["to-slot"], "--to-slot") : undefined
    });
    const creatorRewardsLamports = await getCreatorRewardsBalance(config);
    if (summary.eventCount === 0) throw new Error("No finalized BUY events found in the requested slot window.");

    const funding = await fundReflectionTreasury(
      config,
      new LedgerStore(config.dataDir),
      BigInt(summary.buyVolumeLamports),
      creatorRewardsLamports,
      flags.broadcast === "true"
    );
    console.log(JSON.stringify({
      fundingId: funding.id,
      broadcast: flags.broadcast === "true",
      eventCount: summary.eventCount,
      buyVolumeLamports: funding.buyVolumeLamports,
      reflectionRateBps: funding.reflectionRateBps,
      reflectionPoolLamports: funding.reflectionPoolLamports,
      creatorRewardsBalanceLamports: creatorRewardsLamports.toString(),
      retainedCreatorRewardsLamports: funding.retainedCreatorRewardsLamports,
      status: funding.status
    }, null, 2));
    return;
  }

  if (command === "plan") {
    const snapshotPath = requiredFlag(flags, "snapshot");
    const fundingId = requiredFlag(flags, "funding");
    const snapshot = await readSnapshot(snapshotPath);
    if (snapshot.mint !== config.mint) throw new Error("Snapshot mint does not match TOKEN_MINT in the current environment.");
    const ledger = new LedgerStore(config.dataDir);
    const funding = (await ledger.read()).fundings[fundingId];
    if (!funding || funding.status !== "SENT") throw new Error("A plan requires a recorded reflection funding event with status SENT.");
    const plan = createDistributionPlan(snapshot, funding.id, BigInt(funding.reflectionPoolLamports));
    await ledger.addPlan(plan);
    await ledger.linkFundingToPlan(funding.id, plan.id);
    console.log(JSON.stringify({ jobId: plan.id, fundingId: funding.id, snapshot: basename(snapshotPath), recipients: plan.payments.length, poolLamports: plan.poolLamports, allocatedLamports: plan.allocatedLamports, undistributedLamports: plan.undistributedLamports }, null, 2));
    return;
  }

  if (command === "fund") {
    const buyVolume = parseLamports(requiredFlag(flags, "buy-volume-lamports"));
    const creatorRewards = parseLamports(requiredFlag(flags, "creator-rewards-lamports"));
    const funding = await fundReflectionTreasury(config, new LedgerStore(config.dataDir), buyVolume, creatorRewards, flags.broadcast === "true");
    console.log(JSON.stringify({
      fundingId: funding.id,
      broadcast: flags.broadcast === "true",
      buyVolumeLamports: funding.buyVolumeLamports,
      reflectionRateBps: funding.reflectionRateBps,
      creatorRewardsLamports: funding.creatorRewardsLamports,
      reflectionPoolLamports: funding.reflectionPoolLamports,
      retainedCreatorRewardsLamports: funding.retainedCreatorRewardsLamports,
      status: funding.status
    }, null, 2));
    return;
  }

  if (command === "execute") {
    const jobId = requiredFlag(flags, "job");
    const outcome = await executePlan(config, new LedgerStore(config.dataDir), jobId, { broadcast: flags.broadcast === "true" });
    console.log(JSON.stringify({ jobId, broadcast: flags.broadcast === "true", ...outcome }, null, 2));
    return;
  }

  throw new Error("Usage: snapshot | ingest [--watch] [--pages <n>] [--page-size <n>] [--from-slot <n>] [--to-slot <n>] | fund-auto [--from-slot <n>] [--to-slot <n>] [--broadcast] | fund --buy-volume-lamports <integer> --creator-rewards-lamports <integer> [--broadcast] | plan --snapshot <file> --funding <id> | execute --job <id> [--broadcast]");
}

function readFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg?.startsWith("--")) throw new Error(`Unexpected argument: ${arg ?? ""}`);
    const name = arg.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) flags[name] = "true";
    else {
      flags[name] = next;
      index += 1;
    }
  }
  return flags;
}

function requiredFlag(flags: Record<string, string>, name: string): string {
  const value = flags[name];
  if (!value || value === "true") throw new Error(`--${name} is required`);
  return value;
}

function parsePositiveInt(value: string, flag: string): number {
  if (!/^\d+$/.test(value)) throw new Error(`${flag} must be a positive integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${flag} must be a positive integer.`);
  return parsed;
}

function parseLamports(value: string): bigint {
  if (!/^\d+$/.test(value) || BigInt(value) <= 0n) throw new Error("--lamports values must be positive integers.");
  return BigInt(value);
}

async function readSnapshot(path: string): Promise<HolderSnapshot> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as HolderSnapshot).holders)) throw new Error("Snapshot file is malformed.");
  return parsed as HolderSnapshot;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
