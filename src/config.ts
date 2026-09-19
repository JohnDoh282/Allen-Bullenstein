import "dotenv/config";
import { z } from "zod";

const publicKeyText = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "must be a base58 Solana public key");

const envSchema = z.object({
  SOLANA_RPC_URL: z.string().url(),
  TOKEN_MINT: publicKeyText,
  TOKEN_PROGRAM: z.enum(["legacy", "token-2022"]).default("legacy"),
  CREATOR_REWARD_ALLOCATION_BPS: z.coerce.number().int().refine((value) => value === 100, "must be exactly 100 (1%)").default(100),
  CREATOR_REWARDS_ADDRESS: publicKeyText,
  CREATOR_REWARDS_KEYPAIR_PATH: z.string().min(1).default("secrets/creator-rewards.json"),
  REFLECTION_TREASURY_ADDRESS: publicKeyText,
  MIN_ELIGIBLE_TOKENS: z.string().regex(/^\d+(\.\d+)?$/).default("0"),
  EXCLUDED_WALLETS: z.string().default(""),
  MAX_RECIPIENTS: z.coerce.number().int().positive().max(100_000).default(2_000),
  TREASURY_KEYPAIR_PATH: z.string().min(1).default("secrets/treasury.json"),
  REFLECTIONS_BROADCAST_ENABLED: z.enum(["true", "false"]).default("false"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3_000),
  DATA_DIR: z.string().min(1).default("data")
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.issues.map((issue) => issue.path.join(".") + ": " + issue.message).join(", ")}`);
  }

  const raw = parsed.data;
  return {
    rpcUrl: raw.SOLANA_RPC_URL,
    mint: raw.TOKEN_MINT,
    tokenProgram: raw.TOKEN_PROGRAM,
    creatorRewardAllocationBps: raw.CREATOR_REWARD_ALLOCATION_BPS,
    creatorRewardsAddress: raw.CREATOR_REWARDS_ADDRESS,
    creatorRewardsKeypairPath: raw.CREATOR_REWARDS_KEYPAIR_PATH,
    reflectionTreasuryAddress: raw.REFLECTION_TREASURY_ADDRESS,
    minimumEligibleTokens: raw.MIN_ELIGIBLE_TOKENS,
    excludedWallets: raw.EXCLUDED_WALLETS.split(",").map((value) => value.trim()).filter(Boolean),
    maxRecipients: raw.MAX_RECIPIENTS,
    treasuryKeypairPath: raw.TREASURY_KEYPAIR_PATH,
    broadcastEnabled: raw.REFLECTIONS_BROADCAST_ENABLED === "true",
    port: raw.PORT,
    dataDir: raw.DATA_DIR
  } as const;
}

/** Converts a human token balance to raw base units without using floating point. */
export function toRawTokenAmount(amount: string, decimals: number): bigint {
  const [whole, fraction = ""] = amount.split(".");
  if (fraction.length > decimals) {
    throw new Error(`MIN_ELIGIBLE_TOKENS has more than ${decimals} decimal places`);
  }
  return BigInt(`${whole}${fraction.padEnd(decimals, "0")}`);
}
