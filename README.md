# Amped OpenClaw

[![npm version](https://img.shields.io/npm/v/amped-openclaw.svg)](https://www.npmjs.com/package/amped-openclaw)
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
openclaw plugins install amped-openclaw
```

Verify with `openclaw plugins list` — you should see "Amped DeFi" as loaded.

## Prerequisites

- [OpenClaw](https://openclaw.ai) installed
- Node.js >= 18.0.0

## Wallet Setup (Optional)

The plugin works without a wallet for read-only operations (quotes, balances, discovery). To execute transactions, configure a wallet using one of these options:

> **No wallet configured?** The agent will prompt you to set one up when you try to execute a transaction.

### Option 1: evm-wallet-skill (Recommended)

Install [evm-wallet-skill](https://github.com/amped-finance/evm-wallet-skill) for self-sovereign wallet management:

```bash
git clone https://github.com/amped-finance/evm-wallet-skill.git ~/.openclaw/skills/evm-wallet-skill
cd ~/.openclaw/skills/evm-wallet-skill && npm install
node src/setup.js  # Generate a new wallet
```

The plugin auto-detects wallets from `~/.evm-wallet.json`.

**Supported chains:** Ethereum, Base, Arbitrum, Optimism, Polygon, Sonic, LightLink, HyperEVM, Avalanche, BSC, MegaETH, and more.

**Add custom chains via natural language:**
> "Add Berachain with chain ID 80094 and RPC https://rpc.berachain.com"

Or directly:
```bash
node src/add-chain.js berachain 80094 https://rpc.berachain.com --native-token BERA
```

### Option 2: Bankr

If you use [Bankr](https://bankr.bot) for agent wallets, set your API key:

```bash
export BANKR_API_KEY=your-bankr-api-key
```

> ⚠️ Your Bankr API key must have **"Agent API" access enabled** in your Bankr dashboard.

**Bankr Supported Chains:** Ethereum, Base, Polygon only.

For other chains (Sonic, Arbitrum, Optimism, etc.), use evm-wallet-skill or environment variables.

### Option 3: Environment Variables

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

### Optional Settings

```bash
# Operation mode: "execute" (default) or "simulate"
export AMPED_OC_MODE=execute

# Policy limits
export AMPED_OC_LIMITS_JSON='{"default": {"maxSlippageBps": 100}}'
```

## Available Tools (23)

| Category | Tools |
|----------|-------|
| **Wallet Management** | `amped_oc_list_wallets`, `amped_oc_add_wallet`, `amped_oc_rename_wallet`, `amped_oc_remove_wallet`, `amped_oc_set_default_wallet` |
| **Discovery** | `amped_oc_supported_chains`, `amped_oc_supported_tokens`, `amped_oc_wallet_address`, `amped_oc_money_market_reserves`, `amped_oc_money_market_positions`, `amped_oc_cross_chain_positions`, `amped_oc_user_intents` |
| **Swap** | `amped_oc_swap_quote`, `amped_oc_swap_execute`, `amped_oc_swap_status`, `amped_oc_swap_cancel` |
| **Bridge** | `amped_oc_bridge_discover`, `amped_oc_bridge_quote`, `amped_oc_bridge_execute` |
| **Money Market** | `amped_oc_mm_supply`, `amped_oc_mm_withdraw`, `amped_oc_mm_borrow`, `amped_oc_mm_repay` |

## Wallet Management

Manage wallets through natural language:

```
"What wallets do I have?"
"Add a wallet called trading with address 0x... and private key 0x..."
"Rename main to savings"
"Make bankr my default wallet"
"Remove the trading wallet"
```

### Multiple Wallet Support

The plugin supports multiple wallet sources with nicknames:

| Source | Default Nickname | Supported Chains |
|--------|-----------------|------------------|
| evm-wallet-skill | `main` | All SODAX chains (Ethereum, Base, Arbitrum, Optimism, Polygon, Sonic, etc.) |
| Bankr | `bankr` | Ethereum, Base, Polygon only |
| Environment | Custom | All SODAX chains |

> 💡 The plugin automatically handles chain ID format differences between SODAX (`0x2105.base`) and Bankr (`base`).

Use nicknames in operations:
```
"Swap 100 USDC to ETH using main"
"Check balance on bankr"
"Bridge 50 USDC using trading"
```

### Wallet Config File

Custom wallet configurations persist to:
```
~/.openclaw/extensions/amped-openclaw/wallets.json
```

Example config:
```json
{
  "wallets": {
    "trading": {
      "source": "env",
      "address": "0x...",
      "privateKey": "0x..."
    },
    "savings": {
      "source": "evm-wallet-skill",
      "path": "~/.evm-wallet-savings.json"
    }
  },
  "default": "main"
}
```

## Cross-Chain Money Market

The standout feature: **Supply collateral on Chain A, borrow tokens on Chain B**

```
Supply USDC on Ethereum → Borrow USDT on Arbitrum
```

Your collateral stays on the source chain while borrowed tokens arrive on the destination chain.

## Updating

```bash
openclaw plugins uninstall amped-openclaw
openclaw plugins install amped-openclaw
```

## Installing from Git (Latest)

For the newest features before npm publish:

```bash
# Clone and build
git clone https://github.com/amped-finance/amped-openclaw.git /tmp/amped-openclaw
cd /tmp/amped-openclaw/packages/amped-openclaw-plugin
npm install && npm run build

# Install to OpenClaw
mkdir -p ~/.openclaw/extensions/amped-openclaw
cp -r dist openclaw.plugin.json index.js package.json ~/.openclaw/extensions/amped-openclaw/
cd ~/.openclaw/extensions/amped-openclaw && npm install --production

# Enable and restart
openclaw plugins enable amped-openclaw
openclaw gateway restart
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

### "plugin not found" error during install

The config has a stale entry. Remove it:
```bash
jq 'del(.plugins.entries["amped-openclaw"])' ~/.openclaw/openclaw.json > /tmp/oc.json && mv /tmp/oc.json ~/.openclaw/openclaw.json
```

Then reinstall.

### Plugin not detecting wallet

Check wallet sources:
```bash
# evm-wallet-skill wallet
cat ~/.evm-wallet.json

# Or set environment variable
export AMPED_OC_WALLETS_JSON='{"main":{"address":"0x...","privateKey":"0x..."}}'
```

### Plugin not loading

1. Check it's enabled: `openclaw plugins list`
2. Check logs: `tail -100 ~/.openclaw/logs/openclaw.log`

## Documentation

- **[Plugin README](packages/amped-openclaw-plugin/README.md)** - Complete documentation
- **[SODAX Docs](https://docs.sodax.com)** - SDK documentation

## License

[MIT](LICENSE)

---

<p align="center">
  Built with ❤️ by <a href="https://amped.finance">Amped Finance</a>
</p>
