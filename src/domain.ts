/** A holder balance at the time a snapshot was obtained. Amounts remain strings to preserve u64 precision in JSON. */
export interface HolderBalance {
  wallet: string;
  rawAmount: string;
  tokenAccounts: number;
}

export interface HolderSnapshot {
  id: string;
  mint: string;
  tokenProgram: "legacy" | "token-2022";
  decimals: number;
  finalizedSlot: number;
  createdAt: string;
  minimumEligibleRawAmount: string;
  excludedWallets: string[];
  holders: HolderBalance[];
  totalEligibleRawAmount: string;
}

export interface PlannedPayment {
  wallet: string;
  rawTokenAmount: string;
  lamports: string;
  status: "PLANNED" | "SUBMITTING" | "SENT" | "FAILED";
  signature?: string;
  error?: string;
  updatedAt: string;
}

export interface DistributionPlan {
  id: string;
  fundingId: string;
  snapshotId: string;
  mint: string;
  createdAt: string;
  poolLamports: string;
  allocatedLamports: string;
  undistributedLamports: string;
  payments: PlannedPayment[];
}

export interface ReflectionFunding {
  id: string;
  createdAt: string;
  buyVolumeLamports: string;
  reflectionRateBps: number;
  creatorRewardsLamports: string;
  reflectionPoolLamports: string;
  retainedCreatorRewardsLamports: string;
  sourceWallet: string;
  reflectionTreasury: string;
  status: "PLANNED" | "SUBMITTING" | "SENT" | "FAILED";
  signature?: string;
  error?: string;
  updatedAt: string;
  distributionPlanId?: string;
}

export interface ReflectionLedger {
  version: 1;
  plans: Record<string, DistributionPlan>;
  fundings: Record<string, ReflectionFunding>;
}
