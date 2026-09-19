import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DistributionPlan, ReflectionFunding, ReflectionLedger } from "./domain.js";

function emptyLedger(): ReflectionLedger {
  return { version: 1, plans: {}, fundings: {} };
}

export class LedgerStore {
  readonly path: string;

  constructor(dataDir: string) {
    this.path = join(dataDir, "ledger.json");
  }

  async read(): Promise<ReflectionLedger> {
    try {
      const raw = await readFile(this.path, "utf8");
      const ledger: unknown = JSON.parse(raw);
      if (!isLedger(ledger)) throw new Error("Ledger shape is invalid");
      return ledger;
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === "ENOENT") return emptyLedger();
      throw error;
    }
  }

  async addPlan(plan: DistributionPlan): Promise<void> {
    await this.mutate((ledger) => {
      const existing = ledger.plans[plan.id];
      if (existing) {
        if (!samePlanIntent(existing, plan)) throw new Error(`Plan ID collision for ${plan.id}`);
        return;
      }
      ledger.plans[plan.id] = plan;
    });
  }

  async addFunding(funding: ReflectionFunding): Promise<void> {
    await this.mutate((ledger) => {
      const existing = ledger.fundings[funding.id];
      if (existing) {
        if (!sameFundingIntent(existing, funding)) throw new Error(`Funding ID collision for ${funding.id}`);
        return;
      }
      ledger.fundings[funding.id] = funding;
    });
  }

  async linkFundingToPlan(fundingId: string, planId: string): Promise<void> {
    await this.mutate((ledger) => {
      const funding = ledger.fundings[fundingId];
      if (!funding) throw new Error(`Unknown reflection funding: ${fundingId}`);
      if (funding.distributionPlanId && funding.distributionPlanId !== planId) {
        throw new Error(`Funding ${fundingId} is already assigned to plan ${funding.distributionPlanId}. A funding event can be distributed only once.`);
      }
      funding.distributionPlanId = planId;
      funding.updatedAt = new Date().toISOString();
    });
  }

  async updateFunding(fundingId: string, update: Partial<ReflectionFunding>): Promise<void> {
    await this.mutate((ledger) => {
      const funding = ledger.fundings[fundingId];
      if (!funding) throw new Error(`Unknown reflection funding: ${fundingId}`);
      Object.assign(funding, update, { updatedAt: new Date().toISOString() });
    });
  }

  async updatePayment(jobId: string, wallet: string, update: Partial<DistributionPlan["payments"][number]>): Promise<void> {
    await this.mutate((ledger) => {
      const plan = ledger.plans[jobId];
      if (!plan) throw new Error(`Unknown distribution plan: ${jobId}`);
      const payment = plan.payments.find((item) => item.wallet === wallet);
      if (!payment) throw new Error(`Wallet ${wallet} does not belong to plan ${jobId}`);
      Object.assign(payment, update, { updatedAt: new Date().toISOString() });
    });
  }

  private async mutate(mutator: (ledger: ReflectionLedger) => void): Promise<void> {
    const ledger = await this.read();
    mutator(ledger);
    await mkdir(dirname(this.path), { recursive: true });
    const temporaryPath = `${this.path}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.path);
  }
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error;
}

function isLedger(value: unknown): value is ReflectionLedger {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ReflectionLedger>;
  return candidate.version === 1 && !!candidate.plans && typeof candidate.plans === "object" && !!candidate.fundings && typeof candidate.fundings === "object";
}

function samePlanIntent(left: DistributionPlan, right: DistributionPlan): boolean {
  return left.id === right.id && left.fundingId === right.fundingId && left.snapshotId === right.snapshotId && left.mint === right.mint && left.poolLamports === right.poolLamports && left.payments.every((payment, index) => payment.wallet === right.payments[index]?.wallet && payment.lamports === right.payments[index]?.lamports) && left.payments.length === right.payments.length;
}

function sameFundingIntent(left: ReflectionFunding, right: ReflectionFunding): boolean {
  return left.id === right.id && left.creatorRewardsLamports === right.creatorRewardsLamports && left.allocationBps === right.allocationBps && left.reflectionPoolLamports === right.reflectionPoolLamports && left.sourceWallet === right.sourceWallet && left.reflectionTreasury === right.reflectionTreasury;
}
