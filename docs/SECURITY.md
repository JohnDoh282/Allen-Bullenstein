# Security model

## Trust boundaries

The status API is read-only. The CLI is the only component able to request a transfer, and it requires both an explicit command flag and `REFLECTIONS_BROADCAST_ENABLED=true`. The creator-rewards wallet and reflection treasury are separate roles: the first only funds exactly 1% of recorded creator rewards, while the second only pays an already-funded holder plan. A local JSON keypair loader is included solely for development and low-value test environments.

## Production requirements

- Use a dedicated signer with a strict balance limit and a secure remote-signing adapter; do not leave a high-value seed phrase or JSON keypair on an API host.
- Keep the service and public API on separate credentials and hosts.
- Store encrypted, versioned ledger backups. The ledger is an accounting record, not disposable cache.
- Use a paid RPC provider with documented finality, rate limits, and monitoring. Public endpoints can reject large `getProgramAccounts` requests.
- Restrict network egress, pin package versions with a reviewed lockfile, and deploy CI with secret scanning.
- Add authentication, rate limits, structured logging, and alerting before exposing the API publicly.
- Audit any smart-contract, multisig, Merkle-claim, or remote-signer additions before holding material value.

## Threats this scaffold does not solve

- Legal, tax, sanctions, or securities compliance
- Sybil behavior and wallet splitting
- Wash trading or last-minute balance movement
- RPC censorship, stale data, and historical-balance disputes
- Compromise of an operator who can approve a payout

Treat token-holder rewards as an operational program with public terms, not an immutable promise.
