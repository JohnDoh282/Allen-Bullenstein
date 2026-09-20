/**
 * Allen Bullenstein reflection rules.
 *
 * NOTE: This module defines the intended calculation only. It does not
 * execute Solana transfers or intercept Pump.fun trades. The on-chain
 * integration must enforce the same rules before reflections are advertised
 * as live.
 */

export const MIN_BUY_SOL = 1;
export const REFLECTION_RATE = 0.00003; // 0.003%

export function calculateReflectionSol(buyAmountSol: number): number {
  if (!Number.isFinite(buyAmountSol) || buyAmountSol < MIN_BUY_SOL) {
    return 0;
  }

  return buyAmountSol * REFLECTION_RATE;
}

export function qualifiesForReflection(buyAmountSol: number): boolean {
  return Number.isFinite(buyAmountSol) && buyAmountSol >= MIN_BUY_SOL;
}
