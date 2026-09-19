import { createHash } from "node:crypto";
import type { DistributionPlan, HolderSnapshot } from "./domain.js";

export function createDistributionPlan(snapshot: HolderSnapshot, fundingId: string, poolLamports: bigint): DistributionPlan {
  if (poolLamports <= 0n) throw new Error("Pool must be greater than zero lamports.");
  const totalTokens = BigInt(snapshot.totalEligibleRawAmount);
  if (totalTokens <= 0n) throw new Error("Snapshot has no eligible token balance.");

  const payments = snapshot.holders
    .map((holder) => ({
      wallet: holder.wallet,
      rawTokenAmount: holder.rawAmount,
      lamports: ((poolLamports * BigInt(holder.rawAmount)) / totalTokens).toString(),
      status: "PLANNED" as const,
      updatedAt: new Date().toISOString()
    }))
    .filter((payment) => BigInt(payment.lamports) > 0n);
  const allocated = payments.reduce((sum, payment) => sum + BigInt(payment.lamports), 0n);
  const stablePayload = JSON.stringify({ snapshotId: snapshot.id, fundingId, poolLamports: poolLamports.toString(), payments: payments.map(({ wallet, lamports }) => ({ wallet, lamports })) });
  const id = createHash("sha256").update(stablePayload).digest("hex").slice(0, 20);

  return {
    id,
    fundingId,
    snapshotId: snapshot.id,
    mint: snapshot.mint,
    createdAt: new Date().toISOString(),
    poolLamports: poolLamports.toString(),
    allocatedLamports: allocated.toString(),
    undistributedLamports: (poolLamports - allocated).toString(),
    payments
  };
}
