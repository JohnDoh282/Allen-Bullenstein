# Allen Bullenstein — Devnet Reflection Prototype

## Target rules
- Minimum qualifying buy: **1 SOL**
- Reflection allocation: **0.003%** (`0.00003`) of the qualifying buy
- A buy of exactly 1 SOL qualifies.
- Buys below 1 SOL do not qualify.
- Sells do not trigger reflections.
- Creator fees remain separate from the reflection pool.

## Architecture
This prototype should be implemented as a Solana/Anchor program and tested on devnet before any Pump.fun launch.

The eventual flow is:
1. Detect/validate a qualifying buy in the supported trading path.
2. Calculate buy SOL × 0.00003.
3. Credit the amount to the reflection pool.
4. Maintain holder entitlement accounting.
5. Allow/execute proportional holder distributions.
6. Emit an on-chain event for each qualifying reflection allocation.

### Important Pump.fun constraint
This repository currently contains the calculation/specification, not a live Pump.fun integration. A Pump.fun launch must only be advertised with reflections after compatibility with the final token/trading architecture has been verified.

Solana Token-2022 supports Transfer Hook extensions for custom logic executed during token transfers, but the mint must be created with the required extension and the hook program must implement the Transfer Hook interface.

## Devnet acceptance tests

| Buy | Qualifies | Reflection |
|---:|:---:|---:|
| 0.5 SOL | No | 0 SOL |
| 0.999 SOL | No | 0 SOL |
| 1.0 SOL | Yes | 0.00003 SOL |
| 2.0 SOL | Yes | 0.00006 SOL |
| 10 SOL | Yes | 0.00030 SOL |
| 100 SOL | Yes | 0.00300 SOL |

The production implementation must pass these cases on devnet before the feature is marked live.