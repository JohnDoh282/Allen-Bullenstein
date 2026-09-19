# Solana reflection infrastructure

Operational tooling for a Solana meme-token project that periodically shares a defined SOL pool with eligible token holders. It is deliberately a **treasury-distribution service**, not a token contract and not an investment-promise engine.

## Important launch constraint

A standard pump.fun launch does not make SOL "reflections" happen automatically. The workable model is:

1. Exactly 1% of each recorded creator-reward amount is moved from the creator-rewards wallet into a dedicated reflection treasury.
2. This service takes a finalized holder snapshot for the token mint.
3. It builds and records a deterministic, proportional payout plan.
4. An authorized operator reviews the plan and explicitly broadcasts the SOL transfers.
5. The API publishes plan and payment status for holders.

Keep the program description precise: rewards are discretionary distributions from a defined pool, subject to eligibility and operational constraints. Have counsel review your launch, disclosures, jurisdictional restrictions, and marketing before accepting funds or making public claims.

## What is here

- Finalized holder snapshots from the Solana legacy Token Program or Token-2022
- A fixed 100-basis-point creator-rewards sweep, recorded before it can fund a payout
- Configurable minimum balance, exclusions, and recipient cap
- Exact integer-lamport payout planning with deterministic job IDs
- Append-safe JSON ledger that records every intended payment and transaction signature
- Fail-closed broadcaster: mainnet payouts require `--broadcast` **and** an environment allow-switch
- Minimal public status API with no treasury controls
- Unit tests, GitHub Actions CI, and an operator runbook

## Local setup

```powershell
Copy-Item .env.example .env
pnpm install
pnpm typecheck
pnpm test
```

Set `TOKEN_MINT` only after the token is deployed. Start on devnet with a throwaway keypair and an RPC provider that supports `getProgramAccounts` before using mainnet.

## Operator flow

All amounts sent to the CLI are in lamports (1 SOL = 1,000,000,000 lamports). The broadcast command defaults to a dry run.

```powershell
# 1. Record a creator-reward amount and sweep exactly 1% to the reflection treasury.
#    This dry run records the proposed funding but sends nothing.
pnpm fund -- --creator-rewards-lamports 25000000000

# 2. After reviewing the output, broadcast the 1% sweep (0.25 SOL here).
$env:REFLECTIONS_BROADCAST_ENABLED="true"
pnpm fund -- --creator-rewards-lamports 25000000000 --broadcast

# 3. Create a finalized snapshot under data/snapshots/
pnpm snapshot

# 4. Build a payout plan backed by the sent funding ID from step 2.
pnpm plan -- --snapshot data/snapshots/<snapshot-id>.json --funding <funding-id>

# 5. Inspect the new data/ledger.json, then simulate the payout (default).
pnpm execute -- --job <job-id>

# 6. Broadcast only after independent review and explicit operator approval.
pnpm execute -- --job <job-id> --broadcast
```

The first version sends one recipient per transaction. This is intentional: it makes reconciliation straightforward and avoids an entire batch being ambiguous after a partial failure. Optimize later only after building robust reconciliation.

## API

```powershell
pnpm dev
```

- `GET /health` — service status
- `GET /v1/distributions` — summarized distribution history
- `GET /v1/fundings` — creator-reward sweeps and their linked payout plans
- `GET /v1/distributions/:jobId` — payout plan and payment status
- `GET /v1/holders/:wallet` — payments recorded for a holder

Run this public API behind a reverse proxy with rate limiting. It never exposes signing operations.

## Before mainnet

Read [docs/OPERATIONS.md](docs/OPERATIONS.md) and [docs/SECURITY.md](docs/SECURITY.md). At a minimum, use a separate low-balance hot wallet, a paid RPC provider, independent payout-plan review, backups of the ledger, monitoring, and clear public terms. For very large holder sets, replace the direct RPC scanner with a historical/indexed data source and consider a reviewed Merkle-claim design.

## GitHub

The repository is ready to commit and push, but it intentionally has no remote configured. Add the GitHub repository you choose, then push the initial commit:

```powershell
git add .
git commit -m "chore: initialize Solana reflection infrastructure"
git branch -M main
git remote add origin https://github.com/<your-account>/<your-repository>.git
git push -u origin main
```
