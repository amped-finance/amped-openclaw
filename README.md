# Amped OpenClaw

[![npm version](https://img.shields.io/npm/v/amped-openclaw.svg)](https://www.npmjs.com/package/amped-openclaw)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Cross-chain DeFi in one command.** Swap, bridge, lend, and borrow across 12 chains—including Solana—through natural language.

```bash
openclaw plugins install amped-openclaw
```

That's it. You're ready.

## What Makes This Different

🌐 **12 Chains, One Interface**  
Ethereum, Base, Arbitrum, Optimism, Polygon, Sonic, LightLink, HyperEVM, Avalanche, BSC, Kaia, and Solana. No manual bridging. No chain switching.

⚡ **Intent-Based Execution**  
SODAX's solver network finds optimal routes across chains. You say "swap 100 USDC to ETH"—the protocol handles the rest.

🏦 **Cross-Chain Money Market** *(Industry First)*  
Supply collateral on Ethereum. Borrow USDT on Arbitrum. Your assets stay where they are while liquidity flows where you need it.

## Example Commands

```
"Swap 100 USDC to ETH on Base"
"Bridge 50 USDC from Arbitrum to Solana"
"Supply 1000 USDC on Ethereum and borrow 500 USDT to Polygon"
"What's my portfolio across all chains?"
```

## Wallet Setup

Works without a wallet for quotes and discovery. For transactions, pick one:

| Option | Setup | Best For |
|--------|-------|----------|
| **[evm-wallet-skill](https://github.com/amped-finance/evm-wallet-skill)** | `git clone` + `npm install` | All 12 chains, full control |
| **[Bankr](https://bankr.bot)** | Set `BANKR_API_KEY` | Quick start (ETH/Base/Polygon) |
| **Environment** | Set `AMPED_OC_WALLETS_JSON` | Custom setups |

<details>
<summary>Quick wallet setup</summary>

**evm-wallet-skill (recommended):**
```bash
git clone https://github.com/amped-finance/evm-wallet-skill.git ~/.openclaw/skills/evm-wallet-skill
cd ~/.openclaw/skills/evm-wallet-skill && npm install && node src/setup.js
```

**Environment variables:**
```bash
export AMPED_OC_WALLETS_JSON='{"main":{"address":"0x...","privateKey":"0x..."}}'
```
</details>

## 23 Tools, Zero Complexity

| Category | What You Can Do |
|----------|-----------------|
| **Swap** | Quote, execute, track, cancel cross-chain swaps |
| **Bridge** | Discover routes, quote, execute token bridges |
| **Money Market** | Supply, withdraw, borrow, repay across chains |
| **Portfolio** | Unified balances, positions, and history |
| **Wallets** | Add, rename, remove, set defaults |

## Recent Improvements

- ✅ EVM → Solana bridging
- ✅ SODAXScan intent tracking links  
- ✅ Automatic token resolution (symbols just work)
- ✅ Robust error handling across all chains

## Update

```bash
openclaw plugins uninstall amped-openclaw && openclaw plugins install amped-openclaw
```

## Troubleshooting

**Plugin not loading?** Check `openclaw plugins list` and logs at `~/.openclaw/logs/openclaw.log`

**Module errors?** Run `npm install` in `~/.openclaw/extensions/amped-openclaw`

**Stale config?** Remove entry and reinstall:
```bash
jq 'del(.plugins.entries["amped-openclaw"])' ~/.openclaw/openclaw.json > /tmp/oc.json && mv /tmp/oc.json ~/.openclaw/openclaw.json
```

## Links

- [Full Plugin Docs](packages/amped-openclaw-plugin/README.md)
- [SODAX SDK](https://docs.sodax.com)
- [evm-wallet-skill](https://github.com/amped-finance/evm-wallet-skill)

---

<p align="center">
  Built with ❤️ by <a href="https://amped.finance">Amped Finance</a>
</p>
