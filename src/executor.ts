import { readFile } from "node:fs/promises";
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction } from "@solana/web3.js";
import type { AppConfig } from "./config.js";
import type { DistributionPlan } from "./domain.js";
import { LedgerStore } from "./ledger.js";

export interface ExecuteOptions {
  broadcast: boolean;
}

/**
 * A deliberately conservative executor. It stores SUBMITTING before any network call.
 * A crash at that point is intentionally not retried automatically: operators must
 * reconcile the treasury transaction history before changing the payment state.
 */
export async function executePlan(config: AppConfig, ledger: LedgerStore, jobId: string, options: ExecuteOptions): Promise<{ sent: number; simulated: number; skipped: number }> {
  const stored = await ledger.read();
  const plan = stored.plans[jobId];
  if (!plan) throw new Error(`No plan with ID ${jobId}`);
  const funding = stored.fundings[plan.fundingId];
  if (!funding || funding.status !== "SENT" || funding.distributionPlanId !== plan.id) {
    throw new Error(`Plan ${jobId} is not backed by a recorded, sent reflection funding event.`);
  }
  if (funding.reflectionPoolLamports !== plan.poolLamports) {
    throw new Error(`Plan ${jobId} pool does not match its recorded reflection funding event.`);
  }
  validatePlan(plan);
  if (options.broadcast && !config.broadcastEnabled) {
    throw new Error("Broadcast is blocked. Set REFLECTIONS_BROADCAST_ENABLED=true only after reviewing the plan.");
  }

  let sent = 0;
  let simulated = 0;
  let skipped = 0;
  let connection: Connection | undefined;
  let payer: Keypair | undefined;
  if (options.broadcast) {
    connection = new Connection(config.rpcUrl, "confirmed");
    payer = await loadKeypair(config.treasuryKeypairPath);
    if (payer.publicKey.toBase58() !== config.reflectionTreasuryAddress) {
      throw new Error("TREASURY_KEYPAIR_PATH does not match REFLECTION_TREASURY_ADDRESS.");
    }
  }

  for (const payment of plan.payments) {
    if (payment.status === "SENT") {
      skipped += 1;
      continue;
    }
    if (payment.status === "SUBMITTING") {
      throw new Error(`Payment to ${payment.wallet} is SUBMITTING. Reconcile the treasury before retrying; automatic retry could duplicate a payout.`);
    }
    if (!options.broadcast) {
      simulated += 1;
      continue;
    }

    await ledger.updatePayment(jobId, payment.wallet, { status: "SUBMITTING", error: undefined });
    try {
      const transaction = new Transaction().add(SystemProgram.transfer({
        fromPubkey: payer!.publicKey,
        toPubkey: new PublicKey(payment.wallet),
        lamports: BigInt(payment.lamports)
      }));
      const signature = await sendAndConfirmTransaction(connection!, transaction, [payer!], { commitment: "confirmed" });
      await ledger.updatePayment(jobId, payment.wallet, { status: "SENT", signature, error: undefined });
      sent += 1;
    } catch (error) {
      // A submit may have reached the network. Do not mark this safe to retry.
      await ledger.updatePayment(jobId, payment.wallet, { status: "SUBMITTING", error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }
  return { sent, simulated, skipped };
}

export async function loadKeypair(path: string): Promise<Keypair> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(parsed) || !parsed.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)) {
    throw new Error(`Treasury keypair at ${path} must be a JSON byte array.`);
  }
  return Keypair.fromSecretKey(Uint8Array.from(parsed));
}

function validatePlan(plan: DistributionPlan): void {
  if (plan.payments.length === 0) throw new Error("Refusing to execute a plan with no payments.");
  const sum = plan.payments.reduce((total, payment) => total + BigInt(payment.lamports), 0n);
  if (sum !== BigInt(plan.allocatedLamports)) throw new Error("Plan integrity failure: payment total does not equal allocated amount.");
  if (BigInt(plan.allocatedLamports) + BigInt(plan.undistributedLamports) !== BigInt(plan.poolLamports)) {
    throw new Error("Plan integrity failure: pool accounting does not balance.");
  }
}
