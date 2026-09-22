# Operations runbook

## Reflection funding policy

The target reflection pool is **2 basis points (0.02%) of eligible BUY volume**. It is funded by transferring that amount from the Pump.fun creator-rewards wallet into the dedicated reflection treasury.

Before every funding event:

1. Confirm the canonical mint and measurement period.
2. Obtain reproducible finalized eligible BUY volume in lamports.
3. Obtain creator-reward accrual/availability evidence for the same period.
4. Run `fund --buy-volume-lamports <amount> --creator-rewards-lamports <amount>` without broadcast.
5. Confirm the pool equals `floor(buyVolume × 2 / 10,000)` and creator rewards cover it.
6. Review the funding record.
7. Enable the broadcast allow-switch briefly and transfer the pool.
8. Take a finalized holder snapshot.
9. Generate and independently review the proportional payout plan.
10. Simulate, then explicitly broadcast payouts.
11. Disable the allow-switch and preserve ledger/signatures.

## Important limitation

The repository currently does not ingest Pump.fun trades itself. A production ingestion adapter must provide reproducible finalized BUY volume and creator-reward evidence. Pump.fun's published creator-fee rates vary, so the system deliberately does not derive the reflection pool from an assumed fixed creator-fee percentage. citeturn0search0

## Recovery

A `SUBMITTING` state requires reconciliation against the creator-rewards or reflection-treasury wallet before retrying. Do not reset it to `PLANNED` merely to force another transfer.
