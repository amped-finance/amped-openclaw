# Amped OpenClaw

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)

DeFi operations plugin for [OpenClaw](https://openclaw.ai) enabling seamless cross-chain swaps, bridging, and money market operations via the [SODAX SDK](https://docs.sodax.com).

## Features

- 🔁 **Cross-Chain Swaps** - Intent-based swaps via SODAX solver network
- 🌉 **Token Bridging** - Bridge assets between chains  
- 🏦 **Cross-Chain Money Market** - Supply on one chain, borrow to another
- 📊 **Portfolio Analytics** - Unified view across all chains with risk metrics
- 📜 **Intent History** - Query complete transaction history

## Quick Install

```bash
# Clone the repo
git clone https://github.com/amped-finance/amped-openclaw.git
cd amped-openclaw/packages/amped-openclaw-plugin

# Install in OpenClaw
openclaw plugins install .

# Install dependencies
cd ~/.openclaw/extensions/amped-openclaw
npm install

# Verify (should show "Amped DeFi" as loaded)
openclaw plugins list
```

## Prerequisites

- [OpenClaw](https://openclaw.ai) installed
- Node.js >= 18.0.0
- Wallet private key and RPC URLs (see [Configuration](#configuration))

## Configuration

### Option 1: Environment Variables

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

### Option 2: evm-wallet-skill Integration

If you use [evm-wallet-skill](https://github.com/surfer77/evm-wallet-skill), the plugin automatically detects `EVM_WALLETS_JSON` and `EVM_RPC_URLS_JSON`.

### Optional Settings

```bash
# Operation mode: "execute" (default) or "simulate"
export AMPED_OC_MODE=execute

# Policy limits
export AMPED_OC_LIMITS_JSON='{"default": {"maxSlippageBps": 100}}'
```

## Available Tools (18)

| Category | Tools |
|----------|-------|
| **Discovery** | `amped_oc_supported_chains`, `amped_oc_supported_tokens`, `amped_oc_wallet_address`, `amped_oc_money_market_reserves`, `amped_oc_money_market_positions`, `amped_oc_cross_chain_positions`, `amped_oc_user_intents` |
| **Swap** | `amped_oc_swap_quote`, `amped_oc_swap_execute`, `amped_oc_swap_status`, `amped_oc_swap_cancel` |
| **Bridge** | `amped_oc_bridge_discover`, `amped_oc_bridge_quote`, `amped_oc_bridge_execute` |
| **Money Market** | `amped_oc_mm_supply`, `amped_oc_mm_withdraw`, `amped_oc_mm_borrow`, `amped_oc_mm_repay` |

## Cross-Chain Money Market

The standout feature: **Supply collateral on Chain A, borrow tokens on Chain B**

```
Supply USDC on Ethereum → Borrow USDT on Arbitrum
```

Your collateral stays on the source chain while borrowed tokens arrive on the destination chain.

## Updating

```bash
cd /path/to/amped-openclaw
git pull
cd packages/amped-openclaw-plugin
openclaw plugins install .
cd ~/.openclaw/extensions/amped-openclaw
npm install
```

## Uninstalling

```bash
openclaw plugins uninstall amped-openclaw
```

## Troubleshooting

### "Cannot find module" errors

Install dependencies in the extension directory:
```bash
cd ~/.openclaw/extensions/amped-openclaw
npm install
```

### Plugin not loading

1. Check it's enabled: `openclaw plugins list`
2. Check logs: `tail -100 ~/.openclaw/logs/openclaw.log`

### "plugin not found" after uninstall

Edit `~/.openclaw/openclaw.json` and remove stale entries from `plugins.entries`.

## Documentation

- **[Plugin README](packages/amped-openclaw-plugin/README.md)** - Complete documentation
- **[SODAX Docs](https://docs.sodax.com)** - SDK documentation

## License

[MIT](LICENSE)

---

<p align="center">
  Built with ❤️ by <a href="https://amped.finance">Amped Finance</a>
</p>
