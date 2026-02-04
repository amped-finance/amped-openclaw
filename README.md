# Amped OpenClaw

[![npm version](https://img.shields.io/npm/v/amped-openclaw.svg)](https://www.npmjs.com/package/amped-openclaw)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

DeFi plugin for [OpenClaw](https://openclaw.ai). Swap, bridge, lend, and borrow across 12 chains through natural language.

```bash
openclaw plugins install amped-openclaw
```

## Supported Chains

Ethereum, Base, Arbitrum, Optimism, Polygon, Sonic, LightLink, HyperEVM, Avalanche, BSC, Kaia, Solana

## Capabilities

- **Cross-chain swaps** — swap tokens between any supported chains
- **Token bridging** — move assets across chains
- **Cross-chain money market** — supply collateral on one chain, borrow on another
- **Portfolio view** — balances and positions across all chains

## Example Commands

```
"Swap 100 USDC to ETH on Base"
"Bridge 50 USDC from Arbitrum to Solana"
"Supply 1000 USDC on Ethereum and borrow 500 USDT to Polygon"
"Show my portfolio"
```

## Wallet Setup

Quotes and discovery work without a wallet. Transactions require one of the following:

### Option A: evm-wallet-skill

```bash
git clone https://github.com/amped-finance/evm-wallet-skill.git ~/.openclaw/skills/evm-wallet-skill
cd ~/.openclaw/skills/evm-wallet-skill && npm install && node src/setup.js
```

Supports all 12 chains. The plugin auto-detects wallets from `~/.evm-wallet.json`.

### Option B: Environment Variables

```bash
export AMPED_OC_WALLETS_JSON='{"main":{"address":"0x...","privateKey":"0x..."}}'
```

### Option C: Bankr

Tell the agent your API key: *"My Bankr API key is xyz"*

To get a key: [bankr.bot](https://bankr.bot) → Settings → API Keys → Create with "Agent API" enabled.

Bankr wallets support Ethereum, Base, Polygon, and Solana (as a receive destination for cross-chain swaps).

## Tools

| Category | Tools |
|----------|-------|
| Swap | quote, execute, status, cancel |
| Bridge | discover, quote, execute |
| Money Market | supply, withdraw, borrow, repay |
| Portfolio | balances, positions, intent history |
| Wallets | add, rename, remove, set default |

## Update

```bash
openclaw plugins uninstall amped-openclaw && openclaw plugins install amped-openclaw
```

## Troubleshooting

**Plugin not loading?** Check `openclaw plugins list` and `~/.openclaw/logs/openclaw.log`

**Module errors?** Run `npm install` in `~/.openclaw/extensions/amped-openclaw`

## Links

- [Full Plugin Docs](packages/amped-openclaw-plugin/README.md)
- [evm-wallet-skill](https://github.com/amped-finance/evm-wallet-skill)

---

<p align="center">
  Built by <a href="https://amped.finance">Amped Finance</a>
</p>
