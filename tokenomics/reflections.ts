/**
 * Allen Bullenstein reflection rules.
 *
 * 2 basis points (0.02%) of eligible BUY volume is reserved for holder
 * reflections. The funding source is the creator-rewards wallet; this module
 * does not itself intercept Pump.fun trades or execute Solana transfers.
 */

export const MIN_BUY_SOL = 1;
export const REFLECTION_RATE_BPS = 2; // 0.02%

export function calculateReflectionSol(buyAmountSol: number): number {
  if (!Number.isFinite(buyAmountSol) || buyAmountSol < MIN_BUY_SOL) return 0;
  return buyAmountSol * REFLECTION_RATE_BPS / 10_000;
}

export function qualifiesForReflection(buyAmountSol: number): boolean {
  return Number.isFinite(buyAmountSol) && buyAmountSol >= MIN_BUY_SOL;
}
