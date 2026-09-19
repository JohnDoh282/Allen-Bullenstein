# Operations runbook

## Required roles

Use separate people or hardware-backed identities for:

- Treasury signer custody
- Snapshot and plan operator
- Independent plan reviewer
- Public API deployer

No single compromised developer workstation should be able to change eligibility, approve a plan, and empty the treasury.

## Before every distribution

1. Confirm the canonical mint address from a trusted launch record, not social media.
2. Review `.env`: mainnet RPC, mint, creator-rewards address, separate reflection treasury address, eligibility minimum, exclusions, and recipient cap. The allocation must remain `100` basis points.
3. Determine and record the creator rewards accrued since the previous sweep in lamports. This is an operator assertion; retain the protocol evidence with the operations log.
4. Run `fund --creator-rewards-lamports <amount>` without broadcast. Confirm that the proposed pool is exactly `floor(amount × 100 / 10,000)`.
5. Verify that the creator-rewards and reflection-treasury wallets are distinct dedicated wallets with appropriate fee buffers.
6. Enable the allow-switch briefly and broadcast the reviewed funding event. Confirm the funding record is `SENT` with a signature.
7. Take a snapshot at finalized commitment. Preserve the generated JSON outside the deployment host.
8. Generate a plan using the funding ID. Independently check recipient count, largest recipients, sum of payments, rounding dust, and excluded addresses.
9. Record approval of the exact funding ID and job ID in your internal operations log.
10. First run `execute` without `--broadcast`; it must report the expected simulation count.
11. Broadcast the reviewed payout. Verify every payment is `SENT` with a signature; treat `SUBMITTING` as an incident requiring treasury-history reconciliation.
12. Disable the allow-switch, export the ledger and plan, and publish the status API update.

## Snapshot limitations

The initial scanner merges all mint token accounts by wallet at a finalized point in time. It is not a historical indexer and cannot prevent transfers immediately before or after the RPC query. Do not describe payouts as continuous or automatic. For high-value or high-volume campaigns, use an indexed provider capable of a reproducible slot/block snapshot and retain its evidence with the plan.

## Handling a failed or interrupted payout

`SUBMITTING` is a deliberate stop state. Check the treasury address in a block explorer and your RPC provider for the intended amount, recipient, time range, and transaction signature. Only after a human records the conclusion should the ledger be amended through a reviewed recovery procedure. Do not delete the ledger or change a status to `PLANNED` merely to retry.
