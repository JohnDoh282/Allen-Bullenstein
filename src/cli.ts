import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { loadConfig } from "./config.js";
import type { HolderSnapshot } from "./domain.js";
import { executePlan } from "./executor.js";
import { fundReflectionTreasury } from "./funder.js";
import { LedgerStore } from "./ledger.js";
import { createDistributionPlan } from "./planner.js";
import { buildHolderSnapshot } from "./snapshot.js";

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
    const creatorRewards = parseLamports(requiredFlag(flags, "creator-rewards-lamports"));
    const funding = await fundReflectionTreasury(config, new LedgerStore(config.dataDir), creatorRewards, flags.broadcast === "true");
    console.log(JSON.stringify({ fundingId: funding.id, broadcast: flags.broadcast === "true", creatorRewardsLamports: funding.creatorRewardsLamports, reflectionPoolLamports: funding.reflectionPoolLamports, retainedCreatorRewardsLamports: funding.retainedCreatorRewardsLamports, status: funding.status }, null, 2));
    return;
  }

  if (command === "execute") {
    const jobId = requiredFlag(flags, "job");
    const outcome = await executePlan(config, new LedgerStore(config.dataDir), jobId, { broadcast: flags.broadcast === "true" });
    console.log(JSON.stringify({ jobId, broadcast: flags.broadcast === "true", ...outcome }, null, 2));
    return;
  }

  throw new Error("Usage: snapshot | fund --creator-rewards-lamports <integer> [--broadcast] | plan --snapshot <file> --funding <id> | execute --job <id> [--broadcast]");
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

function parseLamports(value: string): bigint {
  if (!/^\d+$/.test(value) || BigInt(value) <= 0n) throw new Error("--pool-lamports must be a positive integer number of lamports.");
  return BigInt(value);
}

async function readSnapshot(path: string): Promise<HolderSnapshot> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as HolderSnapshot).holders)) throw new Error("Snapshot file is malformed.");
  return parsed as HolderSnapshot;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
