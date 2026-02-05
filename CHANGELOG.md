# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-05

### Changed
- **Package Rename** — Renamed from `amped-openclaw` to `amped-defi`
  - New npm package: `amped-defi@1.0.0`
  - New ClawHub plugin: `amped-defi`
  - All internal references updated
  - Version reset to 1.0.0 for fresh start
- **Silent Startup** — Removed all console logging on plugin initialization
  - Plugin no longer prints status messages on gateway restart
  - Errors still surface when tools are used
- **Error Class Rename** — `AmpedOpenClawError` → `AmpedDefiError`

---

## [2.1.0] - 2026-02-04 (as amped-openclaw)

### Added
- **USD Portfolio Pricing** — Portfolio summary now displays USD values for all tokens
  - New `priceService.ts` fetches prices from SODAX money market reserves
  - Per-token, per-chain, and per-wallet USD totals
  - 1-minute cache for efficient repeated queries
- **Portfolio All Chains** — Query all configured chains by default (#30)
- **Dynamic Config** — Enable SODAX dynamic config with hardcoded 20 bps partner fee (#26)
- **Portfolio Summary Tool** — New `amped_portfolio_summary` for unified balance view

### Fixed
- **POL Rebrand** — Updated Polygon native token symbol from MATIC to POL
- **Position Token Metadata** — Join reserves metadata with user balances for proper token symbols (#35)
- **Hub Chain Validation** — Block money market operations from hub chain (Sonic) (#33)
- **Borrow Allowance Check** — Add allowance validation for borrow/withdraw on hub chain (#32)
- **Money Market Tokens** — Use correct SDK method `getSupportedMoneyMarketTokensByChainId` (#31)
- **User Intents Filter** — Filter events without intentState (#29)
- **Partner Fee Integer** — Use integer bps (20) instead of decimal (0.2) (#28)
- **Partner Fee Config** — Pass partnerFee to each service config (swaps, moneyMarket, bridge) (#27)
- **Partner Address** — Pass partnerAddress to SDK constructor (#25)
- **RPC Source** — Use evm-wallet-skill as primary RPC source (#25)
- **Cross-Chain Borrow** — Resolve borrow token on destination chain for cross-chain MM (#21)
- **Native Token Decimals** — Correct decimal handling for native tokens (#23)
- **Chain ID Normalization** — Normalize chain IDs between SDK and wallet configs (#22)

### Changed
- Upgraded from 19 to 25 OpenClaw tools
- SKILL.md now includes SDK gotchas and agent guidance

### Documentation
- Added agent gotchas section to SKILL.md
- Moved SDK notes to SKILL.md for agent consumption
- Added SODAX SDK gotcha for position data with token metadata
- Added robust git install instructions for VPS/dev environments
- Updated README with portfolio_summary tool documentation

### Dependencies
- `@sodax/sdk@1.1.0-beta-rc2`
- `@sodax/wallet-sdk-core@1.1.0-beta-rc2`

## [0.1.0] - 2026-02-02

### Added
- Initial release of Amped DeFi Plugin
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

[2.1.0]: https://github.com/amped-finance/amped-defi/compare/v0.1.0...v2.1.0
[0.1.0]: https://github.com/amped-finance/amped-defi/releases/tag/v0.1.0
