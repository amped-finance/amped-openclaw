# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-02-02

### Added
- Initial release of Amped OpenClaw Plugin
- **Cross-Chain Swaps**: Execute swaps across chains via SODAX solver network
- **Token Bridging**: Bridge assets between spoke chains and Sonic hub
- **Cross-Chain Money Market**: Supply on Chain A, borrow to Chain B
- **Cross-Chain Position Aggregator**: Unified portfolio view across all chains
  - Total supply/borrow across networks
  - Health factor with risk status
  - Available borrowing power
  - Weighted APYs and net yield
  - Collateral utilization metrics
  - Risk metrics (LTV, liquidation buffer)
  - Personalized recommendations
- **Intent History API**: Query user intent history from SODAX backend
- **Policy Engine**: Security policies with spend limits, slippage caps, allowlists
- **Dual Mode Support**: Execute mode and prepare mode
- **Comprehensive Error Handling**: Structured error codes with remediation
- **Full Test Suite**: Jest tests for all major components
- **19 OpenClaw Tools**:
  - 7 Discovery tools
  - 4 Swap tools
  - 3 Bridge tools
  - 4 Money market tools
  - 1 Advanced intent tool

### Features
- Sonic hub chain support with `SonicSpokeProvider`
- EVM spoke chain support with `EvmSpokeProvider`
- Wallet registry with per-agent key segregation
- Spoke provider caching per walletId
- Policy enforcement for all operations
- Structured logging for observability
- TypeBox schemas for all tool parameters

### Dependencies
- `@sodax/sdk@1.0.4-beta`
- `@sodax/wallet-sdk-core@1.0.4-beta`
- `@sodax/types@1.0.4-beta`
- `@sinclair/typebox@^0.32.0`

[0.1.0]: https://github.com/amped-finance/amped-openclaw/releases/tag/v0.1.0
