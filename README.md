# Allen Bullenstein — Solana reflection infrastructure

This service periodically shares a defined SOL pool with eligible Allen Bullenstein token holders. It is a treasury-distribution service, not a token contract.

## Reflection funding model

The target pool is **0.02% (2 bps) of eligible BUY volume**. The target is funded from SOL accumulated in the Pump.fun creator-rewards wallet.

Pump.fun's published fee schedule shows that creator fees are a percentage of trade volume and can vary by market/state, so this implementation records both the buy-volume basis and the actual creator-reward funding amount instead of assuming a permanent creator-fee percentage. citeturn0search0

This service does **not** automatically intercept Pump.fun buys. A production ingestion/indexing layer must provide finalized eligible buy volume and creator-reward evidence. The service then transfers the calculated pool from the creator-rewards wallet to the reflection treasury, snapshots holders, and creates proportional SOL payouts.

## Example

For **100 SOL of eligible buy volume**:
- Reflection target = **0.02 SOL**
- Creator rewards must have at least **0.02 SOL** available for that funding event.
- The remaining creator rewards stay in the creator-rewards wallet.

## Operator flow

All CLI amounts are lamports.

```powershell
# Dry run
pnpm fund -- --buy-volume-lamports 100000000000 --creator-rewards-lamports 1000000000

# Broadcast the 0.02 SOL reflection funding transfer
$env:REFLECTIONS_BROADCAST_ENABLED="true"
pnpm fund -- --buy-volume-lamports 100000000000 --creator-rewards-lamports 1000000000 --broadcast

# Snapshot holders, build a plan, simulate, then explicitly broadcast payouts
pnpm snapshot
pnpm plan -- --snapshot data/snapshots/<snapshot-id>.json --funding <funding-id>
pnpm execute -- --job <job-id>
pnpm execute -- --job <job-id> --broadcast
```

## Important

- This is funded from creator rewards; it is not an extra buyer fee charged by this service.
- Payouts depend on eligible holder snapshots, available creator rewards, rounding, and operational limits.
- The current repository requires an ingestion layer for Pump.fun buy-volume accounting; it does not yet contain that live trade indexer.
- Keep public descriptions accurate and have counsel review launch/disclosure requirements before mainnet.
