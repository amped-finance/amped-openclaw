---
name: amped-openclaw
description: DeFi operations plugin for swaps, bridging, and cross-chain money market operations via SODAX SDK
version: 1.0.0
author: Amped Finance
tools:
  # Discovery Tools
  - amped_oc_supported_chains
  - amped_oc_supported_tokens
  - amped_oc_wallet_address
  - amped_oc_money_market_reserves
  - amped_oc_money_market_positions (single chain)
  - amped_oc_cross_chain_positions (aggregated view across all chains)
  - amped_oc_user_intents (query intent history via SODAX API)
  # Swap Tools
  - amped_oc_swap_quote
  - amped_oc_swap_execute
  - amped_oc_swap_status
  - amped_oc_swap_cancel
  # Bridge Tools
  - amped_oc_bridge_discover
  - amped_oc_bridge_quote
  - amped_oc_bridge_execute
  # Money Market Tools (Same-Chain & Cross-Chain)
  - amped_oc_mm_supply
  - amped_oc_mm_withdraw
  - amped_oc_mm_borrow
  - amped_oc_mm_repay
  # Advanced Intent Tools
  - amped_oc_mm_create_supply_intent
  - amped_oc_mm_create_borrow_intent
---

# Amped OpenClaw Skill

## Overview

The **Amped OpenClaw** skill provides on-chain DeFi operations capabilities for agents, enabling seamless **swaps**, **bridging**, and **money market** (supply/borrow/repay/withdraw) actions across multiple chains using the SODAX SDK. This skill abstracts the complexity of cross-chain intent flows, allowance handling, and policy enforcement, allowing agents to execute DeFi operations safely and efficiently.

**Key capabilities:**
- Cross-chain and same-chain token swaps via solver network
- Token bridging between spoke chains and the Sonic hub chain
- **Cross-chain money market operations** - supply on one chain, borrow to another!
- Money market operations (supply, withdraw, borrow, repay) with position tracking
- Policy enforcement (spend limits, slippage caps, allowlists)
- Support for both execution mode (agent signs) and prepare mode (unsigned txs for external signing)

## Tool Categories

### Discovery Tools

Use these tools to explore supported chains, tokens, and wallet state before executing operations.

| Tool | Purpose |
|------|---------|
| `amped_oc_supported_chains` | List all supported spoke chains (e.g., ethereum, arbitrum, sonic) |
| `amped_oc_supported_tokens` | Get supported tokens for a specific module (swaps/bridge/moneyMarket) on a chain |
| `amped_oc_wallet_address` | Resolve wallet address by walletId (validates private key ↔ address match in execute mode) |
| `amped_oc_money_market_reserves` | View available money market reserves (collateral/borrow markets) |
| `amped_oc_money_market_positions` | View user's money market positions on a SINGLE chain |
| `amped_oc_cross_chain_positions` | **RECOMMENDED**: View aggregated positions across ALL chains with total supply/borrow, health factor, borrowing power, net APY, and risk metrics |
| `amped_oc_user_intents` | Query user's swap/bridge intent history from SODAX backend API. Shows open, filled, cancelled intents with full event details. |

**When to use:** Always start with discovery tools to verify chain/token support before attempting any operation.

### User Intent History (SODAX API)

Query the SODAX backend API to retrieve complete intent history for a wallet:

```
→ amped_oc_user_intents(
    walletId="main",
    status="all",     // "all", "open", or "closed"
    limit=10,         // Number of results (max 100)
    offset=0          // For pagination
  )
← Returns: {
    pagination: { total: 1545, offset: 0, limit: 10, hasMore: true },
    intents: [
      {
        intentHash: "0x5b18d04a545f089e6de59106fa79498cfc0b0274...",
        txHash: "0x1c4a8ded456b97ba9fa2b95ee954ed7e92a40365...",
        chainId: 146,
        blockNumber: 57622027,
        status: "closed",
        createdAt: "2025-12-10T19:44:00.380Z",
        input: { token: "0x654D...", amount: "10000000000000000000", chainId: 1768124270 },
        output: { token: "0x9Ee1...", minAmount: "78684607057391028830", chainId: 5 },
        deadline: "2026-12-10T19:48:32.000Z",
        events: [
          { type: "intent-filled", txHash: "0x7981...", blockNumber: 57622086, ... }
        ]
      }
    ],
    summary: { totalIntents: 1545, returned: 10, openIntents: 3, closedIntents: 1537 }
  }
```

**When to use:**
- Track status of pending swap/bridge operations
- View historical intent execution history
- Debug failed or cancelled intents
- Monitor solver performance and fill rates

### Swap Tools

Cross-chain and same-chain token swaps via SODAX's intent-based solver network.

| Tool | Purpose |
|------|---------|
| `amped_oc_swap_quote` | Get an exact-in or exact-out swap quote with slippage and fee estimates |
| `amped_oc_swap_execute` | Execute a swap (handles allowance, approval, and execution automatically) |
| `amped_oc_swap_status` | Check the status of a swap transaction or intent |
| `amped_oc_swap_cancel` | Cancel an active swap intent (where supported) |

**When to use swaps:**
- Exchanging one token for another on the same chain
- Cross-chain swaps (e.g., USDC on Ethereum → USDT on Arbitrum)
- When you need competitive pricing via solver competition

**When NOT to use swaps:**
- Moving the same token across chains (use bridge tools instead)
- Borrowing/lending operations (use money market tools instead)

### Bridge Tools

Bridge tokens between spoke chains and the Sonic hub chain.

| Tool | Purpose |
|------|---------|
| `amped_oc_bridge_discover` | Discover bridgeable tokens between two chains |
| `amped_oc_bridge_quote` | Check bridgeability, limits, and max bridgeable amount |
| `amped_oc_bridge_execute` | Execute the bridge operation (handles allowance, approval, and execution) |

**When to use bridging:**
- Moving the same token from one chain to another (e.g., USDC on Ethereum → USDC on Sonic)
- Transferring assets to/from the Sonic hub chain

**When NOT to use bridging:**
- Exchanging different tokens (use swap tools instead)
- Complex DeFi operations (use money market tools instead)

### Money Market Tools

Supply, borrow, repay, and withdraw assets from the SODAX money market with **cross-chain capabilities**.

| Tool | Purpose |
|------|---------|
| `amped_oc_mm_supply` | Supply tokens as collateral to the money market. Supports cross-chain supply. |
| `amped_oc_mm_withdraw` | Withdraw supplied tokens from the money market. Supports cross-chain withdraw. |
| `amped_oc_mm_borrow` | Borrow tokens against supplied collateral. **KEY FEATURE: Can borrow to a different chain!** |
| `amped_oc_mm_repay` | Repay borrowed tokens. Use amount='-1' or repayAll=true for full repay. |
| `amped_oc_mm_create_supply_intent` | [Advanced] Create a supply intent without executing (for custom flows) |
| `amped_oc_mm_create_borrow_intent` | [Advanced] Create a borrow intent without executing (supports cross-chain) |

**Cross-Chain Money Market Capabilities:**

The SODAX money market supports powerful cross-chain operations:

1. **Cross-Chain Borrow** (Most powerful feature)
   - Supply collateral on Chain A (e.g., Ethereum)
   - Borrow tokens to Chain B (e.g., Arbitrum)
   - Your collateral stays on Chain A, but you receive borrowed tokens on Chain B
   - Use `dstChainId` parameter to specify the destination chain

2. **Cross-Chain Supply**
   - Supply tokens on Chain A
   - Collateral is recorded on Chain B (if different)
   - Use `dstChainId` parameter

3. **Cross-Chain Withdraw**
   - Withdraw collateral from Chain A
   - Receive tokens on Chain B
   - Use `dstChainId` parameter

**When to use money market:**
- Earning yield by supplying assets
- Borrowing against existing collateral
- **Accessing liquidity on Chain B without moving collateral from Chain A**
- Arbitraging interest rates across chains
- Managing leveraged positions
- Repaying debt to improve health factor

**When NOT to use money market:**
- Simple token exchanges (use swap tools)
- Moving assets across chains without borrowing (use bridge tools)

## Safety Rules

⚠️ **MUST FOLLOW — These rules are enforced by the Policy Engine:**

1. **Always get a quote before executing**
   - Never execute a swap without first calling `amped_oc_swap_quote`
   - Never execute a bridge without first calling `amped_oc_bridge_quote`
   - Review the quote output for acceptable slippage and output amounts

2. **Verify chain and token are supported**
   - Call `amped_oc_supported_chains` and `amped_oc_supported_tokens` before operations
   - Unsupported chains/tokens will return clear errors

3. **Check slippage is within acceptable bounds**
   - Slippage is specified in basis points (bps): 100 bps = 1%
   - Default max slippage: 100 bps (1%)
   - Quotes with slippage exceeding configured caps will be rejected
   - Policy violations return structured errors with remediation guidance

4. **Never attempt to drain entire wallet**
   - Leave sufficient balance for gas fees
   - Spend limits are enforced per-transaction and per-day
   - Policy caps: `maxSwapInputUsd`, `maxBridgeAmountToken`, `maxBorrowUsd`

5. **Always verify transaction status after execution**
   - Use `amped_oc_swap_status` to track swap completion
   - Check `amped_oc_money_market_positions` to verify position updates
   - Never assume success based on transaction hash alone

6. **Enforce allowlist compliance**
   - Only operate on `allowedChains` and `allowedTokensByChain` per policy
   - Blocked recipients are rejected
   - Policy failures return structured errors with remediation text

7. **Simulation is enabled by default**
   - `skipSimulation=false` unless operator override
   - Simulations catch revert conditions before broadcast

8. **Monitor health factor for money market positions**
   - Health factor < 1.0 = liquidation risk
   - Keep health factor > 1.5 for safety margin
   - Use `amped_oc_money_market_positions` to monitor

## Parameter Conventions

### Amount Units
- **Amounts are in human-readable units** (e.g., `"100"` for 100 USDC, `"0.5"` for 0.5 ETH)
- The SDK internally converts to raw units using token decimals from SODAX config
- Examples:
  - `"1000"` USDC (USDC has 6 decimals) → 1000000000 raw units
  - `"1.5"` ETH (ETH has 18 decimals) → 1500000000000000000 raw units

### Slippage (Basis Points)
- Slippage is specified in **basis points (bps)** where 100 bps = 1%
- Common values:
  - `50` = 0.5% (tight, for stable pairs)
  - `100` = 1% (standard)
  - `300` = 3% (volatile pairs or cross-chain)
- Quotes exceeding configured `maxSlippageBps` will be rejected

### Chain Identifiers
- Chain IDs are **string identifiers**, not numeric chain IDs:
  - `"ethereum"` (Ethereum mainnet)
  - `"arbitrum"` (Arbitrum One)
  - `"sonic"` (Sonic hub chain)
  - `"base"` (Base)
  - `"optimism"` (Optimism)
  - `"avalanche"` (Avalanche)
  - `"bsc"` (BNB Smart Chain)

### Token Addresses
- Token addresses should be **checksum addresses** (mixed-case per EIP-55)
- Examples:
  - `"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"` (USDC on Ethereum)
  - `"0x4200000000000000000000000000000000000006"` (WETH on Base)

### Wallet Identification
- All execute tools require a `walletId` string
- Wallet resolution is by ID; private keys are never exposed in tool parameters

### Optional Parameters
- `recipient`: Optional destination address (defaults to wallet address)
- `timeoutMs`: Optional operation timeout in milliseconds
- `policyId`: Optional policy profile selector for custom limits
- `dstChainId`: **For cross-chain money market** - destination chain for the operation

## Workflows

### Swap Workflow

Complete workflow for executing a token swap:

```
Step 1: Discovery (if needed)
  → amped_oc_supported_chains
  → amped_oc_supported_tokens(module="swaps", chainId="ethereum")

Step 2: Get Quote
  → amped_oc_swap_quote(
      walletId="main",
      srcChainId="ethereum",
      dstChainId="arbitrum",
      srcToken="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      dstToken="0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      amount="1000",
      type="exact_input",
      slippageBps=100
    )
  ← Returns: { quoteId, expectedOutput, slippageBps, fees, deadline }

Step 3: Review Quote
  ✓ Check slippageBps ≤ maxSlippageBps (configurable, default 100)
  ✓ Verify expectedOutput meets requirements
  ✓ Confirm fees are acceptable

Step 4: Execute Swap
  → amped_oc_swap_execute(
      walletId="main",
      quote=<quote from step 2>,
      maxSlippageBps=100,
      skipSimulation=false
    )
  ← Returns: { spokeTxHash, hubTxHash, intentHash, status }

Step 5: Verify Status
  → amped_oc_swap_status(txHash=spokeTxHash)
  ← Returns: { status, confirmations, filledAmount, remainingAmount }

Step 6: Handle Failures (if needed)
  → amped_oc_swap_cancel(walletId="main", intent=<intent>, srcChainId="ethereum")
```

### Bridge Workflow

Complete workflow for bridging tokens between chains:

```
Step 1: Discover Routes
  → amped_oc_bridge_discover(
      srcChainId="ethereum",
      dstChainId="sonic",
      srcToken="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
    )
  ← Returns: { bridgeableTokens: [...] }

Step 2: Get Bridge Quote
  → amped_oc_bridge_quote(
      srcChainId="ethereum",
      dstChainId="sonic",
      srcToken="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      dstToken="0x29219dd400f2bf60e5a23d13be72b486d4038894"
    )
  ← Returns: { isBridgeable: true, maxBridgeableAmount: "1000000" }

Step 3: Review Limits
  ✓ Verify isBridgeable === true
  ✓ Check amount ≤ maxBridgeableAmount
  ✓ Confirm amount within policy limits

Step 4: Execute Bridge
  → amped_oc_bridge_execute(
      walletId="main",
      srcChainId="ethereum",
      dstChainId="sonic",
      srcToken="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      dstToken="0x29219dd400f2bf60e5a23d13be72b486d4038894",
      amount="5000",
      recipient="0x..." // optional, defaults to wallet
    )
  ← Returns: { spokeTxHash, hubTxHash }
```

### Money Market Supply Workflow

Complete workflow for supplying to and monitoring money market positions:

```
Step 1: View Available Markets
  → amped_oc_money_market_reserves(chainId="sonic")
  ← Returns: { reserves: [
      { token: "USDC", supplyAPY: "4.5%", totalSupplied: "..." },
      { token: "WETH", supplyAPY: "2.1%", totalSupplied: "..." }
    ]}

Step 2: Check Current Positions (RECOMMENDED: use cross-chain view)
  → amped_oc_cross_chain_positions(walletId="main")
  ← Returns: { 
      summary: {
        totalSupplyUsd: "15000.00",
        totalBorrowUsd: "5000.00",
        netWorthUsd: "10000.00",
        availableBorrowUsd: "7000.00",
        healthFactor: "2.55",
        healthFactorStatus: { status: "healthy", color: "green" },
        liquidationRisk: "none",
        weightedSupplyApy: "4.25%",
        weightedBorrowApy: "3.50%",
        netApy: "1.08%"
      },
      chainBreakdown: [...],
      collateralUtilization: {...},
      riskMetrics: {...},
      positions: [...],
      recommendations: ["💡 You have $7000.00 in available borrowing power."]
    }

Step 3: Supply Tokens
  → amped_oc_mm_supply(
      walletId="main",
      chainId="sonic",
      token="0x29219dd400f2bf60e5a23d13be72b486d4038894",
      amount="1000",
      useAsCollateral=true  // Use as collateral for borrowing
    )
  ← Returns: { txHash, spokeTxHash, hubTxHash }

Step 4: Verify Position Update (cross-chain view)
  → amped_oc_cross_chain_positions(walletId="main")
  ← Returns: Updated positions reflecting the new supply across all chains
```

### Cross-Chain Positions View (Recommended)

The `amped_oc_cross_chain_positions` tool provides a **unified portfolio view** across all chains. This is the recommended way to check money market positions.

**What it shows:**
- **Total Portfolio Summary**: Supply, borrow, net worth across ALL chains
- **Health Metrics**: Health factor with status indicator, liquidation risk level
- **Borrowing Power**: Available borrow amount based on collateral
- **Yield Metrics**: Weighted supply/borrow APY, net APY
- **Chain Breakdown**: Per-chain position summaries
- **Collateral Utilization**: How much of your collateral is being used
- **Risk Metrics**: Current LTV, buffer until liquidation, safe max borrow
- **Personalized Recommendations**: AI-generated suggestions based on your position

**Example Response:**
```json
{
  "success": true,
  "walletId": "main",
  "address": "0x...",
  "timestamp": "2026-02-02T12:58:27.999Z",
  "summary": {
    "totalSupplyUsd": "25000.00",
    "totalBorrowUsd": "8000.00",
    "netWorthUsd": "17000.00",
    "availableBorrowUsd": "12000.00",
    "healthFactor": "2.65",
    "healthFactorStatus": { "status": "healthy", "color": "green" },
    "liquidationRisk": "none",
    "weightedSupplyApy": "4.52%",
    "weightedBorrowApy": "3.21%",
    "netApy": "2.89%"
  },
  "chainBreakdown": [
    { "chainId": "ethereum", "supplyUsd": "15000.00", "borrowUsd": "5000.00", "healthFactor": "2.80" },
    { "chainId": "arbitrum", "supplyUsd": "5000.00", "borrowUsd": "2000.00", "healthFactor": "2.50" },
    { "chainId": "sonic", "supplyUsd": "5000.00", "borrowUsd": "1000.00", "healthFactor": "5.00" }
  ],
  "collateralUtilization": {
    "totalCollateralUsd": "20000.00",
    "usedCollateralUsd": "8000.00",
    "availableCollateralUsd": "12000.00",
    "utilizationRate": "40.00%"
  },
  "riskMetrics": {
    "maxLtv": "80.00%",
    "currentLtv": "32.00%",
    "bufferUntilLiquidation": "53.00%",
    "safeMaxBorrowUsd": "13600.00"
  },
  "recommendations": [
    "💡 You have $12000.00 in available borrowing power.",
    "🌐 You have positions across 3 chains. Monitor each chain's health factor independently."
  ]
}
```

**When to use:**
- Always start here to get a complete picture of money market positions
- Before any borrow/withdraw operation to check health factor
- To monitor portfolio performance across all chains
- To identify opportunities (available borrowing power, low utilization)

### Cross-Chain Money Market Borrow Workflow (Advanced)

**Key Feature:** Borrow tokens to a different chain than where your collateral is supplied!

```
Scenario: Supply USDC on Ethereum, borrow USDT to Arbitrum

Step 1: Verify Collateral Position on Source Chain
  → amped_oc_money_market_positions(walletId="main", chainId="ethereum")
  ← Returns: { positions: [...], totalCollateralUSD, availableBorrowUSD, healthFactor }

Step 2: Check Borrow Capacity
  ✓ Verify availableBorrowUSD > desired borrow amount
  ✓ Check healthFactor will remain safe after borrow

Step 3: Cross-Chain Borrow
  → amped_oc_mm_borrow(
      walletId="main",
      chainId="ethereum",        // Source chain (where collateral is)
      dstChainId="arbitrum",     // Destination chain (where you receive borrowed tokens)
      token="0xaf88d065e77c8cC2239327C5EDb3A432268e5831",  // USDT on Arbitrum
      amount="500",
      interestRateMode=2         // Variable rate
    )
  ← Returns: { 
      txHash, 
      spokeTxHash,               // On Ethereum (source)
      hubTxHash, 
      dstSpokeTxHash,            // On Arbitrum (destination)
      isCrossChain: true 
    }

Step 4: Verify Position
  → amped_oc_money_market_positions(walletId="main", chainId="ethereum")
  ← Returns: Updated positions with new borrow recorded

Step 5: Verify Received Tokens on Destination Chain
  → amped_oc_wallet_address(walletId="main")
  ← Check USDT balance on Arbitrum via external means or position query
```

### Cross-Chain Money Market Supply Workflow

```
Scenario: Supply tokens on Arbitrum, collateral recorded on Sonic

Step 1: Supply with Cross-Chain Flag
  → amped_oc_mm_supply(
      walletId="main",
      chainId="arbitrum",        // Source chain (where tokens are)
      dstChainId="sonic",        // Destination chain (where collateral is recorded)
      token="0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      amount="1000",
      useAsCollateral=true
    )
  ← Returns: {
      txHash,
      isCrossChain: true,
      message: "Tokens supplied on arbitrum. Collateral available on sonic."
    }

Step 2: Verify on Destination Chain
  → amped_oc_money_market_positions(walletId="main", chainId="sonic")
  ← Returns: Collateral should appear on Sonic
```

### Money Market Repay Workflow

Complete workflow for repaying borrowed tokens:

```
Step 1: Check Borrow Position
  → amped_oc_money_market_positions(walletId="main", chainId="sonic")
  ← Returns: { positions: [...], totalBorrowUSD, healthFactor }

Step 2: Repay (Full or Partial)
  Option A - Partial Repay:
  → amped_oc_mm_repay(
      walletId="main",
      chainId="sonic",
      token="0x...",
      amount="500"
    )
  
  Option B - Full Repay:
  → amped_oc_mm_repay(
      walletId="main",
      chainId="sonic",
      token="0x...",
      amount="-1",        // Special value for max
      repayAll=true
    )

Step 3: Verify Repayment
  → amped_oc_money_market_positions(walletId="main", chainId="sonic")
  ← Returns: Updated positions with reduced borrow, improved healthFactor
```

### Money Market Withdraw Workflow

Complete workflow for withdrawing supplied tokens:

```
Step 1: Check Position and Available Liquidity
  → amped_oc_money_market_positions(walletId="main", chainId="sonic")
  ← Verify: withdrawal won't cause healthFactor to drop below safe level
  ← Verify: sufficient available liquidity in reserve

Step 2: Withdraw
  → amped_oc_mm_withdraw(
      walletId="main",
      chainId="sonic",
      token="0x...",
      amount="500",
      withdrawType="default"  // Options: default, collateral, all
    )
  ← Returns: { txHash, spokeTxHash, hubTxHash }

Step 3: Verify Withdrawal
  → amped_oc_money_market_positions(walletId="main", chainId="sonic")
  ← Returns: Updated positions with reduced supply
```

## Cross-Chain Money Market Examples

### Example 1: Supply on Ethereum, Borrow to Base

```
User: "I have USDC on Ethereum. I want to borrow USDC on Base without moving my collateral."

Agent actions:
1. Check positions on Ethereum
   → amped_oc_money_market_positions(walletId="main", chainId="ethereum")

2. Supply USDC on Ethereum
   → amped_oc_mm_supply(
       walletId="main",
       chainId="ethereum",
       token="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
       amount="10000",
       useAsCollateral=true
     )

3. Cross-chain borrow to Base
   → amped_oc_mm_borrow(
       walletId="main",
       chainId="ethereum",        // Collateral is here
       dstChainId="base",         // Receive borrowed tokens here
       token="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  // USDC on Base
       amount="5000",
       interestRateMode=2
     )

4. Verify positions
   → amped_oc_money_market_positions(walletId="main", chainId="ethereum")
   → amped_oc_money_market_positions(walletId="main", chainId="base")
```

### Example 2: Cross-Chain Withdraw

```
User: "I have collateral on Sonic but I want to withdraw to Arbitrum."

Agent actions:
→ amped_oc_mm_withdraw(
    walletId="main",
    chainId="sonic",             // Collateral source
    dstChainId="arbitrum",       // Token destination
    token="0x...",
    amount="1000"
  )
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AMPED_OC_MODE` | Operation mode: `'execute'` (agent signs) or `'prepare'` (returns unsigned txs) | `execute` |
| `AMPED_OC_WALLETS_JSON` | JSON map of wallet configurations keyed by walletId | `{}` |
| `AMPED_OC_RPC_URLS_JSON` | JSON map of RPC URLs by chainId | `{}` |
| `AMPED_OC_LIMITS_JSON` | Policy limits configuration | `{}` |
| `AMPED_OC_SODAX_DYNAMIC_CONFIG` | Enable dynamic config via `sodax.initialize()` | `false` |

### Wallet Configuration (`AMPED_OC_WALLETS_JSON`)

```json
{
  "main": {
    "address": "0x...",
    "privateKey": "0x..."  // Required for execute mode
  },
  "trading": {
    "address": "0x...",
    "privateKey": "0x..."
  }
}
```

**Security:** Private keys are never logged. In prepare mode, only address is required.

### Policy Limits (`AMPED_OC_LIMITS_JSON`)

```json
{
  "maxSwapInputUsd": 10000,
  "maxBridgeAmountToken": {
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": 50000
  },
  "maxBorrowUsd": 5000,
  "maxSlippageBps": 100,
  "allowedChains": ["ethereum", "arbitrum", "sonic", "base"],
  "allowedTokensByChain": {
    "ethereum": ["0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "0x..."]
  },
  "blockedRecipients": ["0x..."]
}
```

### RPC Configuration (`AMPED_OC_RPC_URLS_JSON`)

```json
{
  "ethereum": "https://eth-mainnet.g.alchemy.com/v2/...",
  "arbitrum": "https://arb-mainnet.g.alchemy.com/v2/...",
  "base": "https://base-mainnet.g.alchemy.com/v2/...",
  "sonic": "https://rpc.soniclabs.com"
}
```

## Error Handling

### Policy Violations

Policy violations return structured errors with:
- `code`: Error code (e.g., `POLICY_SLIPPAGE_EXCEEDED`)
- `message`: Human-readable description
- `remediation`: Suggested action to resolve
- `current`: Current value that violated policy
- `limit`: Configured limit

### Common Error Codes

| Code | Description | Remediation |
|------|-------------|-------------|
| `POLICY_SLIPPAGE_EXCEEDED` | Quote slippage exceeds maxSlippageBps | Increase maxSlippageBps or wait for better conditions |
| `POLICY_SPEND_LIMIT_EXCEEDED` | Amount exceeds per-transaction or daily limit | Reduce amount or request limit increase |
| `POLICY_CHAIN_NOT_ALLOWED` | Chain not in allowedChains | Add chain to allowedChains or use different chain |
| `POLICY_TOKEN_NOT_ALLOWED` | Token not in allowedTokensByChain | Add token to allowlist or use different token |
| `INSUFFICIENT_BALANCE` | Wallet balance < requested amount | Reduce amount or fund wallet |
| `INSUFFICIENT_ALLOWANCE` | Token allowance < requested amount | Tool will auto-approve, or approve manually |
| `QUOTE_EXPIRED` | Quote deadline has passed | Get fresh quote |
| `BRIDGE_NOT_AVAILABLE` | Token pair not bridgeable | Use swap for different tokens or different route |
| `MM_HEALTH_FACTOR_LOW` | Operation would cause liquidation risk | Repay debt or add collateral first |
| `MM_CROSS_CHAIN_NOT_SUPPORTED` | Cross-chain operation not supported for this pair | Use same-chain operation or different token/chain |

## Idempotency and Retries

### Client Operation ID

Execute tools accept an optional `clientOperationId` parameter for idempotency:
- Duplicate operations with the same ID within the cache window return the cached result
- Prevents duplicate broadcasts on retries
- Recommended for automated workflows

### Retry Guidance

- **Read operations** (quotes, status, positions): Safe to retry with exponential backoff
- **Write operations** (execute, supply, borrow): Use `clientOperationId` to prevent duplicates
- **Timeout handling**: Bridge and money market operations specify timeouts; respect SDK defaults

## Security Model

### Key Segregation

- Each agent workspace has distinct wallet configurations
- Spoke providers are cached per `walletId` and never shared across agents
- Private keys are resolved by `walletId` only; never passed as parameters

### Execution vs Prepare Mode

| Mode | Signing | Use Case |
|------|---------|----------|
| `execute` | Agent signs with private key | Automated agents, server-side operations |
| `prepare` | Returns unsigned tx for external signing | Hardware wallets, air-gapped signing, multi-sig |

### Logging

Structured logs include:
- `requestId`: Unique request identifier
- `agentId`: Agent identifier (if available)
- `walletId`: Wallet identifier
- `opType`: Operation type (swap, bridge, supply, etc.)
- `chainIds`, `tokenAddresses`: Operation context
- `txHashes`: Transaction hashes (for tracing)

**Never logged:** Private keys, full wallet JSON, sensitive configuration

## Chain-Specific Notes

### Sonic Hub Chain

- Sonic is the **hub chain** for SODAX operations
- Uses `SonicSpokeProvider` instead of `EvmSpokeProvider`
- Special handling required for hub chain operations
- Money market operations are hub-centric but support cross-chain interactions

### EVM Spoke Chains

- Use `EvmSpokeProvider` for standard EVM chains (Ethereum, Arbitrum, Base, etc.)
- Standard allowance/approval flow applies
- Bridge operations go: Spoke → Hub → Destination Spoke
- Cross-chain money market operations leverage the hub for state management

## Cross-Chain Money Market Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SODAX Money Market Flow                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Cross-Chain Borrow Example:                                     │
│  Supply USDC on Ethereum → Borrow USDT on Arbitrum              │
│                                                                  │
│  ┌─────────────┐         ┌─────────┐         ┌─────────────┐   │
│  │  Ethereum   │ ──────► │  Sonic  │ ──────► │  Arbitrum   │   │
│  │  (Supply)   │         │  (Hub)  │         │  (Borrow)   │   │
│  └─────────────┘         └─────────┘         └─────────────┘   │
│        │                      │                     │           │
│        │  1. Supply USDC      │                     │           │
│        │  2. Record collateral│                     │           │
│        │─────────────────────►│                     │           │
│        │                      │  3. Verify collateral│           │
│        │                      │  4. Process borrow   │           │
│        │                      │────────────────────►│           │
│        │                      │                     │ 5. Deliver│
│        │                      │                     │    USDT   │
│        │                      │                     │           │
│                                                                  │
│  Key Insight: Your collateral stays on the source chain,         │
│  but you receive borrowed tokens on the destination chain!       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Examples

### Example 1: Simple Same-Chain Swap

```
User: "Swap 100 USDC for ETH on Ethereum"

Agent actions:
1. amped_oc_swap_quote(
     walletId="main",
     srcChainId="ethereum",
     dstChainId="ethereum",
     srcToken="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
     dstToken="0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
     amount="100",
     type="exact_input",
     slippageBps=100
   )
2. Review quote (slippage 0.8%, expected output 0.042 ETH)
3. amped_oc_swap_execute(walletId="main", quote=<quote>, maxSlippageBps=100)
4. amped_oc_swap_status(txHash=<spokeTxHash>)
```

### Example 2: Cross-Chain Bridge

```
User: "Bridge 1000 USDC from Ethereum to Sonic"

Agent actions:
1. amped_oc_bridge_discover(srcChainId="ethereum", dstChainId="sonic", srcToken="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48")
2. amped_oc_bridge_quote(srcChainId="ethereum", dstChainId="sonic", srcToken="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", dstToken="0x29219dd400f2bf60e5a23d13be72b486d4038894")
3. amped_oc_bridge_execute(walletId="main", srcChainId="ethereum", dstChainId="sonic", srcToken="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", dstToken="0x29219dd400f2bf60e5a23d13be72b486d4038894", amount="1000")
```

### Example 3: Supply and Borrow Loop (Same Chain)

```
User: "Supply 5000 USDC and borrow 2000 USDT on Sonic"

Agent actions:
1. amped_oc_money_market_reserves(chainId="sonic")
2. amped_oc_mm_supply(walletId="main", chainId="sonic", token="0x29219dd400f2bf60e5a23d13be72b486d4038894", amount="5000")
3. amped_oc_money_market_positions(walletId="main", chainId="sonic")
4. amped_oc_mm_borrow(walletId="main", chainId="sonic", token="0x...usdt...", amount="2000")
5. amped_oc_money_market_positions(walletId="main", chainId="sonic") // Verify new health factor
```

### Example 4: Cross-Chain Money Market (Advanced)

```
User: "I want to use my USDC on Ethereum as collateral to borrow USDC on Arbitrum for a trading opportunity"

Agent actions:
1. Verify supported chains and tokens
   → amped_oc_supported_tokens(module="moneyMarket", chainId="ethereum")
   → amped_oc_supported_tokens(module="moneyMarket", chainId="arbitrum")

2. Check current positions
   → amped_oc_money_market_positions(walletId="main", chainId="ethereum")
   → amped_oc_money_market_positions(walletId="main", chainId="arbitrum")

3. Supply USDC on Ethereum
   → amped_oc_mm_supply(
       walletId="main",
       chainId="ethereum",
       token="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
       amount="50000",
       useAsCollateral=true
     )

4. Cross-chain borrow to Arbitrum
   → amped_oc_mm_borrow(
       walletId="main",
       chainId="ethereum",        // Source: collateral is here
       dstChainId="arbitrum",     // Destination: receive tokens here
       token="0xaf88d065e77c8cC2239327C5EDb3A432268e5831",  // USDC on Arbitrum
       amount="20000",
       interestRateMode=2
     )

5. Verify the cross-chain borrow worked
   → Check positions on Ethereum (collateral + debt recorded)
   → Check USDC balance on Arbitrum (borrowed tokens received)

Result: User has 20k USDC on Arbitrum to trade with, while their 50k USDC collateral remains on Ethereum!
```
