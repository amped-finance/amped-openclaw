# Amped OpenClaw

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)

DeFi operations plugin and skill pack for [OpenClaw](https://openclaw.ai) enabling seamless cross-chain swaps, bridging, and money market operations via the [SODAX SDK](https://docs.sodax.com).

## Prerequisites

- [OpenClaw](https://openclaw.ai) agent environment
- **[evm-wallet-skill](https://github.com/surfer77/evm-wallet-skill)** - This plugin integrates with evm-wallet-skill for wallet and RPC configuration
- Node.js >= 18.0.0
- SODAX SDK dependencies (installed automatically)

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

### 1. Prerequisites

Ensure you have [evm-wallet-skill](https://github.com/surfer77/evm-wallet-skill) configured with your wallets and RPCs:

```bash
# evm-wallet-skill configuration (set these in your environment)
export EVM_WALLETS_JSON='{
  "main": {
    "address": "0xYourWalletAddress",
    "privateKey": "0xYourPrivateKey"
  }
}'

export EVM_RPC_URLS_JSON='{
  "ethereum": "https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY",
  "arbitrum": "https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY",
  "sonic": "https://rpc.soniclabs.com"
}'
```

> **Note:** If you don't use evm-wallet-skill, you can set `AMPED_OC_WALLETS_JSON` and `AMPED_OC_RPC_URLS_JSON` instead (see [Configuration](#configuration)).

### 2. Install the Plugin (Build from Source)

```bash
cd packages/amped-openclaw-plugin
npm install
npm run build
```

Verify the build output exists:
```bash
ls dist/index.js  # Should exist
```

### 3. Install in OpenClaw

Install the plugin in your OpenClaw environment:

```bash
# Install from local path
openclaw plugins install /path/to/amped-openclaw/packages/amped-openclaw-plugin

# Or install from tarball
openclaw plugins install /path/to/amped-openclaw-plugin.tar.gz
```

### 4. Enable the Plugin

Edit your OpenClaw configuration file (typically `~/.openclaw/config.yaml` or similar):

```yaml
plugins:
  entries:
    amped-openclaw:
      enabled: true
      # Optional: specify path if not installed via CLI
      # path: /path/to/amped-openclaw/packages/amped-openclaw-plugin
```

### 5. Restart OpenClaw Gateway

Restart the OpenClaw gateway to load the plugin:

```bash
openclaw gateway restart
```

### 6. Verify Installation

Check that the plugin is loaded and tools are available:

```bash
openclaw tools list | grep amped_oc
```

You should see tools like:
- `amped_oc_supported_chains`
- `amped_oc_swap_quote`
- `amped_oc_cross_chain_positions`
- etc.

## Configuration

This plugin **automatically integrates** with [evm-wallet-skill](https://github.com/surfer77/evm-wallet-skill). If you're using that skill, **no additional configuration is required!**

### Option 1: Using evm-wallet-skill (Recommended)

The plugin automatically detects and uses these environment variables from evm-wallet-skill:

| Variable | Description |
|----------|-------------|
| `EVM_WALLETS_JSON` | Wallet configuration (address, private key) |
| `EVM_RPC_URLS_JSON` | RPC URLs for supported chains |

Example:
```bash
export EVM_WALLETS_JSON='{
  "main": {
    "address": "0xYourWalletAddress",
    "privateKey": "0xYourPrivateKey"
  }
}'

export EVM_RPC_URLS_JSON='{
  "ethereum": "https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY",
  "arbitrum": "https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY",
  "sonic": "https://rpc.soniclabs.com"
}'
```

### Option 2: Plugin-Specific Configuration

If you don't use evm-wallet-skill, set these plugin-specific variables:

```bash
export AMPED_OC_WALLETS_JSON='{
  "main": {
    "address": "0xYourWalletAddress",
    "privateKey": "0xYourPrivateKey"
  }
}'

export AMPED_OC_RPC_URLS_JSON='{
  "ethereum": "https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY",
  "arbitrum": "https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY",
  "sonic": "https://rpc.soniclabs.com"
}'
```

### Optional Configuration

```bash
# Operation mode: "execute" (signs transactions) or "prepare" (returns unsigned txs)
export AMPED_OC_MODE=execute

# Policy limits for security
export AMPED_OC_LIMITS_JSON='{
  "default": {
    "maxSlippageBps": 100,
    "allowedChains": ["ethereum", "arbitrum", "sonic"]
  }
}'

# SODAX API (for intent history queries)
export SODAX_API_URL=https://canary-api.sodax.com
```

See `.env.example` for all available options.

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
