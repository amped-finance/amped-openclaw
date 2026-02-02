# Amped OpenClaw

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)

DeFi operations plugin and skill pack for [OpenClaw](https://openclaw.ai) enabling seamless cross-chain swaps, bridging, and money market operations via the [SODAX SDK](https://docs.sodax.com).

## Overview

Amped OpenClaw provides a complete DeFi toolkit for AI agents, enabling sophisticated on-chain operations across multiple networks:

- 🔁 **Cross-Chain Swaps** - Intent-based swaps via SODAX solver network
- 🌉 **Token Bridging** - Bridge assets between chains  
- 🏦 **Cross-Chain Money Market** - Supply on one chain, borrow to another
- 📊 **Portfolio Analytics** - Unified view across all chains with risk metrics
- 📜 **Intent History** - Query complete transaction history

## Repository Structure

```
amped-openclaw/
├── packages/amped-openclaw-plugin/    # TypeScript plugin for OpenClaw
│   ├── src/                           # Source code
│   ├── examples/                      # Usage examples
│   ├── README.md                      # Plugin documentation
│   └── package.json
├── skills/amped-openclaw/             # OpenClaw skill definition
│   └── SKILL.md                       # Skill instructions
├── .env.example                       # Environment template
├── CHANGELOG.md                       # Version history
├── CONTRIBUTING.md                    # Contribution guidelines
└── LICENSE                            # MIT License
```

## Quick Start

### 1. Install the Plugin

```bash
cd packages/amped-openclaw-plugin
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Build

```bash
npm run build
```

### 4. Test

```bash
npm test
```

## Configuration

### Required Environment Variables

```bash
# Wallet configuration
export AMPED_OC_WALLETS_JSON='{
  "main": {
    "address": "0xYourWalletAddress",
    "privateKey": "0xYourPrivateKey"
  }
}'

# RPC URLs
export AMPED_OC_RPC_URLS_JSON='{
  "ethereum": "https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY",
  "arbitrum": "https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY",
  "sonic": "https://rpc.soniclabs.com"
}'
```

See `.env.example` for full configuration options.

## Features

### Cross-Chain Money Market

The standout feature: **Supply collateral on Chain A, borrow tokens on Chain B**

```typescript
// Supply USDC on Ethereum
await agentTools.call('amped_oc_mm_supply', {
  walletId: 'main',
  chainId: 'ethereum',
  token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  amount: '50000',
  useAsCollateral: true
});

// Borrow USDT on Arbitrum (cross-chain!)
await agentTools.call('amped_oc_mm_borrow', {
  walletId: 'main',
  chainId: 'ethereum',
  dstChainId: 'arbitrum',
  token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  amount: '20000'
});
```

### Unified Portfolio View

Get complete cross-chain position data:

```typescript
const positions = await agentTools.call('amped_oc_cross_chain_positions', {
  walletId: 'main'
});

// Returns:
// - Total supply/borrow across all chains
// - Health factor and liquidation risk
// - Available borrowing power
// - Weighted APYs
// - Risk metrics and recommendations
```

## Available Tools

### Discovery (7 tools)
- `amped_oc_supported_chains`
- `amped_oc_supported_tokens`
- `amped_oc_wallet_address`
- `amped_oc_money_market_reserves`
- `amped_oc_money_market_positions`
- `amped_oc_cross_chain_positions`
- `amped_oc_user_intents`

### Swap (4 tools)
- `amped_oc_swap_quote`
- `amped_oc_swap_execute`
- `amped_oc_swap_status`
- `amped_oc_swap_cancel`

### Bridge (3 tools)
- `amped_oc_bridge_discover`
- `amped_oc_bridge_quote`
- `amped_oc_bridge_execute`

### Money Market (4 tools)
- `amped_oc_mm_supply`
- `amped_oc_mm_withdraw`
- `amped_oc_mm_borrow`
- `amped_oc_mm_repay`

## Documentation

- **[Plugin README](packages/amped-openclaw-plugin/README.md)** - Complete plugin documentation
- **[Skill Documentation](skills/amped-openclaw/SKILL.md)** - OpenClaw skill instructions
- **[PRD](Amped-Openclaw-PRD.md)** - Product Requirements Document

## Dependencies

- `@sodax/sdk@1.0.4-beta`
- `@sodax/wallet-sdk-core@1.0.4-beta`
- `@sodax/types@1.0.4-beta`
- `@sinclair/typebox@^0.32.0`

## Testing

```bash
cd packages/amped-openclaw-plugin
npm test
```

Test coverage includes:
- Error handling utilities
- Policy engine
- Position aggregator
- Wallet registry
- SODAX API client

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## Security

- **Key Segregation**: Each agent has distinct wallet configs
- **Policy Enforcement**: Spend limits, slippage caps, allowlists
- **No Key Logging**: Private keys never logged
- **Simulation**: Transactions simulated by default

## License

[MIT](LICENSE) - See LICENSE file for details.

## Support

- **Docs**: [https://docs.sodax.com](https://docs.sodax.com)
- **Issues**: [GitHub Issues](https://github.com/amped-finance/amped-openclaw/issues)

---

<p align="center">
  Built with ❤️ by <a href="https://amped.finance">Amped Finance</a>
</p>
