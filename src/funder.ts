import { createHash } from "node:crypto";
import { Connection, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction } from "@solana/web3.js";
import type { AppConfig } from "./config.js";
import type { ReflectionFunding } from "./domain.js";
import { loadKeypair } from "./executor.js";
import { LedgerStore } from "./ledger.js";

const REFLECTION_RATE_BPS = 2; // 0.02% of eligible buy volume

export function createReflectionFunding(config: AppConfig, buyVolumeLamports: bigint, creatorRewardsLamports: bigint): ReflectionFunding {
  if (buyVolumeLamports <= 0n) throw new Error("Eligible buy volume must be greater than zero lamports.");
  if (creatorRewardsLamports <= 0n) throw new Error("Creator rewards must be greater than zero lamports.");

  const reflectionPoolLamports = (buyVolumeLamports * BigInt(REFLECTION_RATE_BPS)) / 10_000n;
  if (reflectionPoolLamports <= 0n) throw new Error("0.02% of the supplied buy volume rounds to zero lamports.");
  if (creatorRewardsLamports < reflectionPoolLamports) {
    throw new Error("Creator rewards are insufficient to fund the required 0.02% buy-volume reflection pool.");
  }

  const stablePayload = JSON.stringify({
    buyVolumeLamports: buyVolumeLamports.toString(),
    reflectionRateBps: REFLECTION_RATE_BPS,
    creatorRewardsLamports: creatorRewardsLamports.toString(),
    sourceWallet: config.creatorRewardsAddress,
    reflectionTreasury: config.reflectionTreasuryAddress
  });
  const now = new Date().toISOString();

  return {
    id: createHash("sha256").update(stablePayload).digest("hex").slice(0, 20),
    createdAt: now,
    buyVolumeLamports: buyVolumeLamports.toString(),
    reflectionRateBps: REFLECTION_RATE_BPS,
    creatorRewardsLamports: creatorRewardsLamports.toString(),
    reflectionPoolLamports: reflectionPoolLamports.toString(),
    retainedCreatorRewardsLamports: (creatorRewardsLamports - reflectionPoolLamports).toString(),
    sourceWallet: config.creatorRewardsAddress,
    reflectionTreasury: config.reflectionTreasuryAddress,
    status: "PLANNED",
    updatedAt: now
  };
}

export async function fundReflectionTreasury(
  config: AppConfig,
  ledger: LedgerStore,
  buyVolumeLamports: bigint,
  creatorRewardsLamports: bigint,
  broadcast: boolean
): Promise<ReflectionFunding> {
  const proposed = createReflectionFunding(config, buyVolumeLamports, creatorRewardsLamports);
  await ledger.addFunding(proposed);
  const funding = (await ledger.read()).fundings[proposed.id]!;

  if (funding.status === "SENT" || !broadcast) return funding;
  if (funding.status === "SUBMITTING") {
    throw new Error(`Funding ${funding.id} is SUBMITTING. Reconcile the creator-rewards wallet before retrying.`);
  }
  if (!config.broadcastEnabled) throw new Error("Funding broadcast is blocked. Set REFLECTIONS_BROADCAST_ENABLED=true only after review.");

  const payer = await loadKeypair(config.creatorRewardsKeypairPath);
  if (payer.publicKey.toBase58() !== config.creatorRewardsAddress) {
    throw new Error("CREATOR_REWARDS_KEYPAIR_PATH does not match CREATOR_REWARDS_ADDRESS.");
  }

  await ledger.updateFunding(funding.id, { status: "SUBMITTING", error: undefined });
  try {
    const connection = new Connection(config.rpcUrl, "confirmed");
    const transaction = new Transaction().add(SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: new PublicKey(config.reflectionTreasuryAddress),
      lamports: BigInt(funding.reflectionPoolLamports)
    }));
    const signature = await sendAndConfirmTransaction(connection, transaction, [payer], { commitment: "confirmed" });
    await ledger.updateFunding(funding.id, { status: "SENT", signature, error: undefined });
  } catch (error) {
    await ledger.updateFunding(funding.id, { status: "SUBMITTING", error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
  return (await ledger.read()).fundings[funding.id]!;
}
