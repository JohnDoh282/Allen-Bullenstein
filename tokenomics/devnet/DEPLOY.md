# Devnet deployment

This directory is the first on-chain prototype for Allen Bullenstein's holder-reflection economics.

## Current scope

The Anchor program validates the 1 SOL minimum and calculates 0.003% (3 / 100,000) of a qualifying buy. Its devnet prototype `record_buy` instruction transfers only the calculated reflection amount into a configured pool and emits an event.

It intentionally does not claim to detect Pump.fun buys. Pump.fun integration is a separate compatibility milestone.

## Local setup

From this directory:

```bash
anchor build
anchor test
```

For Windows, use WSL for the Rust/Solana/Anchor toolchain.

## Devnet

1. Generate a dedicated devnet deployer/program keypair. Never commit private keys.
2. Replace the placeholder `declare_id!` in `programs/allen_reflections/src/lib.rs` with the generated program public key.
3. Set the same program ID in `Anchor.toml`.
4. Point the provider cluster at devnet.
5. Fund the deployer with devnet SOL.
6. Run `anchor build`, then `anchor deploy`.
7. Run devnet integration tests and inspect every transaction on Solana Explorer.

## Production gate

Do not connect this prototype to the live Allen token until:
- the economic tests pass;
- devnet transactions confirm the exact reflection amounts;
- holder accounting/distribution is implemented and tested;
- authorization and pool withdrawal controls are tested;
- the Pump.fun trading architecture is confirmed compatible;
- the final production mint/program configuration is reviewed.

The current program is an economic prototype, not a production reflection contract.