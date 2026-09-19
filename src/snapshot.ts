import { createHash } from "node:crypto";
import { AccountLayout, getMint, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import type { AppConfig } from "./config.js";
import { toRawTokenAmount } from "./config.js";
import type { HolderBalance, HolderSnapshot } from "./domain.js";

function snapshotId(payload: string): string {
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

/**
 * Reads all token accounts for the mint, merges them by wallet, and filters eligibility.
 * A production deployment with significant volume should source historical balances from
 * an indexed provider; direct getProgramAccounts is appropriate for initial testing only.
 */
export async function buildHolderSnapshot(config: AppConfig): Promise<HolderSnapshot> {
  const connection = new Connection(config.rpcUrl, "finalized");
  const mint = new PublicKey(config.mint);
  const programId = config.tokenProgram === "legacy" ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID;
  const finalizedSlot = await connection.getSlot("finalized");
  const mintInfo = await getMint(connection, mint, "finalized", programId);
  const minimumRawAmount = toRawTokenAmount(config.minimumEligibleTokens, mintInfo.decimals);

  const filters = config.tokenProgram === "legacy"
    ? [{ dataSize: AccountLayout.span }, { memcmp: { offset: 0, bytes: mint.toBase58() } }]
    : [{ memcmp: { offset: 0, bytes: mint.toBase58() } }];
  const accounts = await connection.getProgramAccounts(programId, {
    commitment: "finalized",
    filters
  });
  const excluded = new Set(config.excludedWallets);
  const merged = new Map<string, { amount: bigint; tokenAccounts: number }>();

  for (const account of accounts) {
    const decoded = AccountLayout.decode(account.account.data);
    const wallet = new PublicKey(decoded.owner).toBase58();
    const amount = BigInt(decoded.amount.toString());
    const current = merged.get(wallet) ?? { amount: 0n, tokenAccounts: 0 };
    current.amount += amount;
    current.tokenAccounts += 1;
    merged.set(wallet, current);
  }

  const holders: HolderBalance[] = [...merged.entries()]
    .filter(([wallet, balance]) => !excluded.has(wallet) && balance.amount >= minimumRawAmount)
    .map(([wallet, balance]) => ({ wallet, rawAmount: balance.amount.toString(), tokenAccounts: balance.tokenAccounts }))
    .sort((a, b) => a.wallet.localeCompare(b.wallet));

  if (holders.length === 0) throw new Error("Snapshot contains no eligible holders. Check the mint, exclusions, and minimum balance.");
  if (holders.length > config.maxRecipients) {
    throw new Error(`Snapshot has ${holders.length} holders, above MAX_RECIPIENTS=${config.maxRecipients}. Do not bypass this cap without reviewing treasury costs and scalability.`);
  }

  const totalEligibleRawAmount = holders.reduce((sum, holder) => sum + BigInt(holder.rawAmount), 0n);
  const createdAt = new Date().toISOString();
  const id = snapshotId(JSON.stringify({ mint: config.mint, finalizedSlot, createdAt, holders }));

  return {
    id,
    mint: config.mint,
    tokenProgram: config.tokenProgram,
    decimals: mintInfo.decimals,
    finalizedSlot,
    createdAt,
    minimumEligibleRawAmount: minimumRawAmount.toString(),
    excludedWallets: [...excluded].sort(),
    holders,
    totalEligibleRawAmount: totalEligibleRawAmount.toString()
  };
}
