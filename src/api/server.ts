import { createServer } from "node:http";
import { loadConfig } from "../config.js";
import type { DistributionPlan } from "../domain.js";
import { LedgerStore } from "../ledger.js";

const config = loadConfig();
const ledger = new LedgerStore(config.dataDir);

const server = createServer(async (request, response) => {
  try {
    if (request.method !== "GET") return respond(response, 405, { error: "Method not allowed" });
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (path === "/health") return respond(response, 200, { status: "ok" });

    const snapshot = await ledger.read();
    if (path === "/v1/distributions") {
      const distributions = Object.values(snapshot.plans).map(toSummary).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return respond(response, 200, { distributions });
    }
    if (path === "/v1/fundings") {
      const fundings = Object.values(snapshot.fundings).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return respond(response, 200, { fundings });
    }

    const distributionMatch = path.match(/^\/v1\/distributions\/([a-f0-9]+)$/);
    if (distributionMatch) {
      const plan = snapshot.plans[distributionMatch[1]!];
      return plan ? respond(response, 200, plan) : respond(response, 404, { error: "Distribution not found" });
    }

    const holderMatch = path.match(/^\/v1\/holders\/([1-9A-HJ-NP-Za-km-z]{32,44})$/);
    if (holderMatch) {
      const wallet = holderMatch[1]!;
      const payments = Object.values(snapshot.plans).flatMap((plan) => plan.payments.filter((payment) => payment.wallet === wallet).map((payment) => ({ jobId: plan.id, mint: plan.mint, ...payment })));
      return respond(response, 200, { wallet, payments });
    }
    return respond(response, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    return respond(response, 500, { error: "Internal server error" });
  }
});

server.listen(config.port, () => console.log(`Reflection status API listening on :${config.port}`));

function toSummary(plan: DistributionPlan) {
  const counts = plan.payments.reduce<Record<string, number>>((accumulator, payment) => {
    accumulator[payment.status] = (accumulator[payment.status] ?? 0) + 1;
    return accumulator;
  }, {});
  return {
    id: plan.id,
    fundingId: plan.fundingId,
    snapshotId: plan.snapshotId,
    mint: plan.mint,
    createdAt: plan.createdAt,
    poolLamports: plan.poolLamports,
    allocatedLamports: plan.allocatedLamports,
    undistributedLamports: plan.undistributedLamports,
    paymentStatus: counts
  };
}

function respond(response: import("node:http").ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(payload));
}
