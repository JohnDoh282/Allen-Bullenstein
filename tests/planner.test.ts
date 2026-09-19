import { describe, expect, it } from "vitest";
import { toRawTokenAmount } from "../src/config.js";
import type { HolderSnapshot } from "../src/domain.js";
import { createDistributionPlan } from "../src/planner.js";
import { createReflectionFunding } from "../src/funder.js";
import type { AppConfig } from "../src/config.js";

const snapshot: HolderSnapshot = {
  id: "snapshot-1",
  mint: "Mint111111111111111111111111111111111111111",
  tokenProgram: "legacy",
  decimals: 6,
  finalizedSlot: 123,
  createdAt: "2026-01-01T00:00:00.000Z",
  minimumEligibleRawAmount: "0",
  excludedWallets: [],
  holders: [
    { wallet: "WalletA", rawAmount: "3", tokenAccounts: 1 },
    { wallet: "WalletB", rawAmount: "2", tokenAccounts: 1 },
    { wallet: "WalletC", rawAmount: "1", tokenAccounts: 1 }
  ],
  totalEligibleRawAmount: "6"
};

describe("payout planning", () => {
  it("allocates proportional whole lamports and retains rounding dust", () => {
    const plan = createDistributionPlan(snapshot, "funding-1", 10n);
    expect(plan.payments.map((payment) => payment.lamports)).toEqual(["5", "3", "1"]);
    expect(plan.allocatedLamports).toBe("9");
    expect(plan.undistributedLamports).toBe("1");
  });

  it("converts human token inputs without floating-point rounding", () => {
    expect(toRawTokenAmount("123.45", 6)).toBe(123_450_000n);
    expect(() => toRawTokenAmount("0.0000001", 6)).toThrow("more than 6 decimal places");
  });

  it("assigns exactly 1% of creator rewards to the reflection pool", () => {
    const config = {
      creatorRewardAllocationBps: 100,
      creatorRewardsAddress: "Creator1111111111111111111111111111111111111",
      reflectionTreasuryAddress: "Treasury111111111111111111111111111111111111",
      rpcUrl: "https://example.test",
      mint: "Mint111111111111111111111111111111111111111",
      tokenProgram: "legacy",
      creatorRewardsKeypairPath: "unused",
      minimumEligibleTokens: "0",
      excludedWallets: [],
      maxRecipients: 1,
      treasuryKeypairPath: "unused",
      broadcastEnabled: false,
      port: 3000,
      dataDir: "data"
    } as AppConfig;
    const funding = createReflectionFunding(config, 12_345n);
    expect(funding.reflectionPoolLamports).toBe("123");
    expect(funding.retainedCreatorRewardsLamports).toBe("12222");
  });
});
