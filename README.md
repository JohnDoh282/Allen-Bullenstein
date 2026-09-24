# Allen Bullenstein — Solana reflection infrastructure

This service periodically shares a defined SOL pool with eligible Allen Bullenstein token holders. It is a treasury-distribution service, not a token contract.

## Reflection funding model

The target pool is **0.02% (2 bps) of eligible BUY volume**. The target is funded from SOL accumulated in the Pump.fun creator-rewards wallet.

Pump.fun's published fee schedule shows that creator fees are a percentage of trade volume and can vary by market/state, so this implementation records both the buy-volume basis and the actual creator-reward funding amount instead of assuming a permanent creator-fee percentage. citeturn0search0

The repository now includes a finalized on-chain ingestion layer. It reads Pump.fun bonding-curve TradeEvent logs and PumpSwap BuyEvent logs, keeps only successful SOL-paired BUYs for TOKEN_MINT, deduplicates by transaction/event ID, persists evidence to data/ingestion/buy-events.jsonl, and can subscribe to finalized logs in real time. The funding command can then use that recorded buy volume plus the current creator-rewards wallet balance.

## Live ingestion

\`\`\`powershell
# Scan recent finalized activity and calculate the current 0.02% pool
pnpm ingest -- --pages 5

# Measure a specific finalized slot window
pnpm ingest -- --from-slot <start-slot> --to-slot <end-slot> --pages 20

# Keep a live finalized listener running for both Pump.fun and PumpSwap
pnpm ingest -- --watch

# Dry-run funding using the stored buy volume and creator-rewards wallet balance
pnpm fund-auto -- --from-slot <start-slot> --to-slot <end-slot>

# Explicitly broadcast only after review and enabling the existing safety switch
$env:REFLECTIONS_BROADCAST_ENABLED="true"
pnpm fund-auto -- --from-slot <start-slot> --to-slot <end-slot> --broadcast
\`\`\`

The ingestion layer uses Solana finalized logs rather than the Pump.fun frontend API, keeping the accounting tied to finalized on-chain transactions. Pump.fun documents the bonding-curve TradeEvent and PumpSwap exposes a separate BuyEvent; the repository handles both stages of a coin's lifecycle.

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
