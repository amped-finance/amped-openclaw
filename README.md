# Amped DeFi

[![npm version](https://img.shields.io/npm/v/amped-defi.svg)](https://www.npmjs.com/package/amped-defi)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

DeFi plugin for [OpenClaw](https://openclaw.ai). Swap, bridge, lend, and borrow across 12 chains through natural language.

```bash
openclaw plugins install amped-defi
```

Or browse on [ClawdHub](https://clawhub.ai/skills/amped-defi).

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

### Option A: evm-wallet-skill (Recommended)

**Easy install** — just ask your agent:
> "Install evm-wallet-skill for me"

**Via ClawdHub** (once [PR #5](https://github.com/surfer77/evm-wallet-skill/pull/5) is merged):
```bash
openclaw skills install evm-wallet-skill
```

**Manual install** (use our fork with SODAX chain support):
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

## Tools (24)

| Category | Tools |
|----------|-------|
| Portfolio | `portfolio_summary` (balances + positions across all chains) |
| Swap | quote, execute, status, cancel |
| Bridge | discover, quote, execute |
| Money Market | supply, withdraw, borrow, repay |
| Discovery | chains, tokens, reserves, positions, intents |
| Wallets | list, add, rename, remove, set default |

## Update

```bash
openclaw plugins uninstall amped-defi && openclaw plugins install amped-defi
```

## Install from Git (Dev/VPS)

For the latest unreleased version:

```bash
# Clone and build
cd /tmp && rm -rf amped-defi
git clone https://github.com/amped-finance/amped-defi.git
cd amped-defi/packages/amped-defi-plugin
npm install && npm run build

# Install to OpenClaw (creates directory if needed)
mkdir -p ~/.openclaw/extensions/amped-defi
cp -r dist openclaw.plugin.json index.js package.json ~/.openclaw/extensions/amped-defi/
cd ~/.openclaw/extensions/amped-defi && npm install --omit=dev

# Enable and restart
jq '.plugins.entries["amped-defi"] = {"enabled": true}' ~/.openclaw/openclaw.json > /tmp/oc.json && mv /tmp/oc.json ~/.openclaw/openclaw.json
openclaw gateway restart
```

Verify: `openclaw plugins list` should show 24 tools.

## Troubleshooting

**Plugin not loading?** Check `openclaw plugins list` and `~/.openclaw/logs/openclaw.log`

**Module errors?** Run `npm install` in `~/.openclaw/extensions/amped-defi`

## Links

- [ClawdHub](https://clawhub.ai/skills/amped-defi) — discover and install
- [Full Plugin Docs](packages/amped-defi-plugin/README.md)
- [evm-wallet-skill](https://github.com/surfer77/evm-wallet-skill) (upstream) | [our fork](https://github.com/amped-finance/evm-wallet-skill)

---

<p align="center">
  Built by <a href="https://amped.finance">Amped Finance</a>
</p>

