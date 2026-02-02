# OpenClaw Testing Guide

This guide walks through testing the Amped OpenClaw plugin with an OpenClaw agent.

## Prerequisites

1. OpenClaw CLI installed
2. Node.js >= 18.0.0
3. Wallet with test funds
4. RPC URLs for supported chains

## Installation

### 1. Clone and Build

```bash
git clone https://github.com/amped-finance/amped-openclaw.git
cd amped-openclaw/packages/amped-openclaw-plugin
npm install
npm run build
```

### 2. Configure OpenClaw

Add the plugin to your OpenClaw configuration:

```json
{
  "plugins": [
    {
      "id": "amped-openclaw",
      "path": "./packages/amped-openclaw-plugin",
      "entry": "dist/index.js"
    }
  ]
}
```

### 3. Set Environment Variables

```bash
# Required
export AMPED_OC_WALLETS_JSON='{
  "main": {
    "address": "0xYourAddress",
    "privateKey": "0xYourPrivateKey"
  }
}'

export AMPED_OC_RPC_URLS_JSON='{
  "ethereum": "https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY",
  "arbitrum": "https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY",
  "sonic": "https://rpc.soniclabs.com"
}'

# Optional but recommended
export AMPED_OC_LIMITS_JSON='{
  "default": {
    "maxSlippageBps": 100,
    "allowedChains": ["ethereum", "arbitrum", "sonic"]
  }
}'

export SODAX_API_URL=https://canary-api.sodax.com
```

## Testing Workflow

### Test 1: Discovery Tools

Verify the plugin loads correctly:

```
[Agent] List supported chains
→ amped_oc_supported_chains
← Returns: [ethereum, arbitrum, base, optimism, sonic, ...]
```

```
[Agent] Show my wallet address
→ amped_oc_wallet_address(walletId="main")
← Returns: 0xYourAddress
```

### Test 2: Cross-Chain Position View

Get a complete portfolio overview:

```
[Agent] Show my money market positions across all chains
→ amped_oc_cross_chain_positions(walletId="main")
← Returns:
  summary: {
    totalSupplyUsd: "...",
    totalBorrowUsd: "...",
    healthFactor: "...",
    recommendations: [...]
  }
```

### Test 3: Swap Quote

Get a quote before executing:

```
[Agent] Get a quote to swap 100 USDC to USDT on Ethereum
→ amped_oc_swap_quote(
    walletId="main",
    srcChainId="ethereum",
    dstChainId="ethereum",
    srcToken="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    dstToken="0xdAC17F958D2ee523a2206206994597C13D831ec7",
    amount="100",
    type="exact_input",
    slippageBps=100
  )
```

### Test 4: Intent History

Query historical intents:

```
[Agent] Show my recent swap history
→ amped_oc_user_intents(walletId="main", status="all", limit=10)
← Returns: Paginated list of intents with events
```

## Troubleshooting

### Plugin Not Loading

1. Check build succeeded: `npm run build`
2. Verify entry point exists: `dist/index.js`
3. Check OpenClaw plugin config path

### Tool Registration Failures

1. Verify environment variables are set
2. Check wallet configuration JSON is valid
3. Ensure RPC URLs are accessible

### Transaction Failures

1. Check wallet has sufficient balance
2. Verify token approvals
3. Review policy limits
4. Check chain is in allowedChains

### SDK Errors

1. Verify `@sodax/sdk` is installed: `npm list @sodax/sdk`
2. Check SDK version matches: `1.0.4-beta`
3. Review SODAX documentation for API changes

## Safety Checklist

Before testing with real funds:

- [ ] Using testnet or small amounts
- [ ] Policy limits configured
- [ ] Slippage tolerance appropriate
- [ ] Destination addresses verified
- [ ] Health factor monitored

## Debug Mode

Enable verbose logging:

```bash
export DEBUG=amped-openclaw:*
```

View structured logs:

```bash
# Logs are JSON formatted for observability
{"timestamp":"2026-02-02T...","component":"amped-openclaw","level":"info",...}
```

## Support

- Open an issue for bugs
- Check SODAX docs: https://docs.sodax.com
- Review PRD: [Amped-Openclaw-PRD.md](Amped-Openclaw-PRD.md)

## Example Session

```
User: What are my money market positions?

Agent: I'll check your cross-chain money market positions.

→ amped_oc_cross_chain_positions(walletId="main")

Agent: Here's your portfolio summary:

**Total Portfolio:**
- Supply: $25,000.00
- Borrow: $8,000.00
- Net Worth: $17,000.00
- Health Factor: 2.65 (healthy ✅)

**By Chain:**
- Ethereum: Supply $15k, Borrow $5k, HF 2.80
- Arbitrum: Supply $5k, Borrow $2k, HF 2.50
- Sonic: Supply $5k, Borrow $1k, HF 5.00

**Recommendations:**
💡 You have $12,000.00 in available borrowing power.
🌐 You have positions across 3 chains.
```

---

Ready to test! Start with discovery tools and work your way up to full operations.
