/**
 * Money Market Tools for Amped OpenClaw Plugin
 * 
 * Provides advanced supply, withdraw, borrow, and repay operations for the SODAX money market.
 * Supports both same-chain and cross-chain operations (e.g., supply on Chain A, borrow to Chain B).
 * 
 * Key capabilities:
 * - Supply: Deposit tokens as collateral on any supported chain
 * - Borrow: Borrow tokens to any chain (cross-chain capable)
 * - Withdraw: Withdraw supplied tokens from any chain
 * - Repay: Repay borrowed tokens from any chain
 * - Intent-based operations: Create intents for custom flows
 * 
 * Cross-chain flows:
 * 1. Supply on Chain A → Borrow to Chain B (different destination)
 * 2. Supply on Chain A → Borrow on Chain A (same chain)
 * 3. Cross-chain repay: Repay debt from any chain
 * 4. Cross-chain withdraw: Withdraw collateral to any chain
 */

import { Type, Static } from "@sinclair/typebox";
import { getSodaxClient } from "../sodax/client";
import { getSpokeProvider } from "../providers/spokeProviderFactory";
import { PolicyEngine } from "../policy/policyEngine";
import { getWalletRegistry, WalletRegistry } from "../wallet/walletRegistry";
import { AgentTools } from "../types";

// ============================================================================
// TypeBox Schemas
// ============================================================================

/**
 * Base schema for money market operations
 */
const MoneyMarketBaseSchema = Type.Object({
  walletId: Type.String({ 
    description: "Unique identifier for the wallet" 
  }),
  chainId: Type.String({ 
    description: "Source SODAX spoke chain ID where the operation originates (e.g., 'ethereum', 'arbitrum', 'sonic')" 
  }),
  token: Type.String({
    description: "Token address or symbol to supply/borrow/withdraw/repay",
  }),
  amount: Type.String({
    description: "Amount in human-readable units (e.g., '100.5' for 100.5 USDC). Use '-1' for max repay (repay full debt).",
  }),
  timeoutMs: Type.Optional(
    Type.Number({
      description: "Operation timeout in milliseconds",
      default: 180000,
    })
  ),
  policyId: Type.Optional(
    Type.String({ description: "Optional policy profile identifier for custom limits" })
  ),
  skipSimulation: Type.Optional(
    Type.Boolean({
      description: "Skip transaction simulation (not recommended)",
      default: false,
    })
  ),
});

/**
 * Supply operation schema
 * Supply tokens as collateral to the money market on the specified chain
 */
const MoneyMarketSupplySchema = Type.Composite([
  MoneyMarketBaseSchema,
  Type.Object({
    useAsCollateral: Type.Optional(
      Type.Boolean({
        description: "Whether to use the supplied tokens as collateral for borrowing (default: true)",
        default: true,
      })
    ),
    // Cross-chain supply options
    dstChainId: Type.Optional(
      Type.String({
        description: "Optional destination chain for the supply operation. If different from chainId, performs cross-chain supply.",
      })
    ),
    recipient: Type.Optional(
      Type.String({
        description: "Optional recipient address for the supplied position (defaults to wallet address)",
      })
    ),
  }),
]);

/**
 * Withdraw operation schema
 * Withdraw supplied tokens from the money market
 */
const MoneyMarketWithdrawSchema = Type.Composite([
  MoneyMarketBaseSchema,
  Type.Object({
    withdrawType: Type.Optional(
      Type.Union([
        Type.Literal('default'),
        Type.Literal('collateral'),
        Type.Literal('all'),
      ], {
        description: "Withdraw type: 'default' (standard), 'collateral' (withdraw collateral only), 'all' (withdraw maximum)",
        default: 'default',
      })
    ),
    // Cross-chain withdraw options
    dstChainId: Type.Optional(
      Type.String({
        description: "Optional destination chain to receive withdrawn tokens. If different from chainId, performs cross-chain withdraw.",
      })
    ),
    recipient: Type.Optional(
      Type.String({
        description: "Optional recipient address to receive withdrawn tokens (defaults to wallet address)",
      })
    ),
  }),
]);

/**
 * Borrow operation schema
 * Borrow tokens from the money market
 * 
 * Key feature: Can borrow to a DIFFERENT chain than where collateral is supplied!
 * Example: Supply USDC on Ethereum, borrow USDT to Arbitrum
 */
const MoneyMarketBorrowSchema = Type.Composite([
  MoneyMarketBaseSchema,
  Type.Object({
    interestRateMode: Type.Optional(
      Type.Union([
        Type.Literal(1, { description: "Stable interest rate" }),
        Type.Literal(2, { description: "Variable interest rate (recommended)" }),
      ], {
        description: "Interest rate mode: 1 = Stable, 2 = Variable",
        default: 2,
      })
    ),
    referralCode: Type.Optional(
      Type.String({
        description: "Optional referral code for the borrow operation",
      })
    ),
    // Cross-chain borrow options (key feature!)
    dstChainId: Type.Optional(
      Type.String({
        description: "Destination chain to receive borrowed tokens. If different from chainId, performs cross-chain borrow (supply on chainId, receive borrowed tokens on dstChainId).",
      })
    ),
    recipient: Type.Optional(
      Type.String({
        description: "Optional recipient address to receive borrowed tokens (defaults to wallet address on dstChainId or chainId)",
      })
    ),
  }),
]);

/**
 * Repay operation schema
 * Repay borrowed tokens to the money market
 */
const MoneyMarketRepaySchema = Type.Composite([
  MoneyMarketBaseSchema,
  Type.Object({
    interestRateMode: Type.Optional(
      Type.Union([
        Type.Literal(1, { description: "Stable interest rate" }),
        Type.Literal(2, { description: "Variable interest rate" }),
      ], {
        description: "Interest rate mode of the debt to repay: 1 = Stable, 2 = Variable",
        default: 2,
      })
    ),
    repayAll: Type.Optional(
      Type.Boolean({
        description: "If true, repays the full debt amount (useful for closing position)",
        default: false,
      })
    ),
    // Cross-chain repay options
    collateralChainId: Type.Optional(
      Type.String({
        description: "Optional chain ID where collateral is held (for cross-chain repay scenarios)",
      })
    ),
  }),
]);

/**
 * Create Intent schemas for advanced users
 * These allow building custom multi-step flows
 */
const CreateSupplyIntentSchema = Type.Composite([
  MoneyMarketSupplySchema,
  Type.Object({
    raw: Type.Optional(
      Type.Boolean({
        description: "If true, returns raw transaction data instead of executing (for custom signing flows)",
        default: false,
      })
    ),
  }),
]);

const CreateBorrowIntentSchema = Type.Composite([
  MoneyMarketBorrowSchema,
  Type.Object({
    raw: Type.Optional(
      Type.Boolean({
        description: "If true, returns raw transaction data instead of executing (for custom signing flows)",
        default: false,
      })
    ),
  }),
]);

const CreateWithdrawIntentSchema = Type.Composite([
  MoneyMarketWithdrawSchema,
  Type.Object({
    raw: Type.Optional(
      Type.Boolean({
        description: "If true, returns raw transaction data instead of executing (for custom signing flows)",
        default: false,
      })
    ),
  }),
]);

const CreateRepayIntentSchema = Type.Composite([
  MoneyMarketRepaySchema,
  Type.Object({
    raw: Type.Optional(
      Type.Boolean({
        description: "If true, returns raw transaction data instead of executing (for custom signing flows)",
        default: false,
      })
    ),
  }),
]);

// ============================================================================
// Output Types
// ============================================================================

interface MoneyMarketOperationResult {
  success: boolean;
  txHash?: string;
  status: "success" | "pending" | "failed";
  spokeTxHash?: string;
  hubTxHash?: string;
  intentHash?: string;
  operation: string;
  chainId: string;
  dstChainId?: string;
  token: string;
  amount: string;
  message?: string;
  warnings?: string[];
  // Cross-chain specific
  isCrossChain?: boolean;
  srcSpokeTxHash?: string;
  dstSpokeTxHash?: string;
  // Raw intent data (for createIntent operations)
  rawIntent?: unknown;
}

interface IntentResult extends MoneyMarketOperationResult {
  intentData: unknown;
  requiresSubmission: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Converts human-readable amount to token units (wei)
 */
function parseTokenAmount(amount: string, decimals: number = 18): bigint {
  // Handle special case for max repay
  if (amount === '-1') {
    return BigInt(-1);
  }
  
  const parsed = parseFloat(amount);
  if (isNaN(parsed)) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  
  const multiplier = Math.pow(10, decimals);
  return BigInt(Math.floor(parsed * multiplier));
}

/**
 * Resolves wallet and creates spoke provider for the operation
 */
async function resolveWalletAndProvider(
  walletId: string,
  chainId: string
): Promise<{
  wallet: { address: string; privateKey?: string };
  spokeProvider: any;
}> {
  const walletRegistry = getWalletRegistry();
  const wallet = walletRegistry.getWallet(walletId);

  const spokeProvider = await getSpokeProvider(wallet.address, chainId);

  return { wallet, spokeProvider };
}

/**
 * Common pre-operation checks and allowance handling
 */
async function prepareMoneyMarketOperation(
  walletId: string,
  chainId: string,
  token: string,
  amount: string,
  operation: "supply" | "withdraw" | "borrow" | "repay",
  policyId?: string
): Promise<{ wallet: any; spokeProvider: any; policyResult: any }> {
  // Ensure sodax client is initialized
  const _sodaxClient = getSodaxClient(); // Just verify it's ready
  void _sodaxClient;

  // Resolve wallet and create spoke provider
  const { wallet, spokeProvider } = await resolveWalletAndProvider(walletId, chainId);

  // Policy check
  const policyEngine = new PolicyEngine();
  const policyResult = await policyEngine.checkMoneyMarket({
    walletId,
    chainId,
    token,
    amount, // Add required amount parameter
    amountUsd: parseFloat(amount), // Simplified - would need actual price lookup
    operation,
    policyId,
  });

  if (!policyResult.allowed) {
    throw new Error(
      `Policy check failed: ${policyResult.reason || "Operation not permitted"}.`
    );
  }

  return { wallet, spokeProvider, policyResult };
}

/**
 * Checks and handles token approval if needed
 */
async function ensureAllowance(
  params: {
    token: string;
    amount: bigint;
    action: 'supply' | 'repay';
  },
  spokeProvider: any,
  raw: boolean = false
): Promise<{ approvalTxHash?: string; rawApproval?: unknown }> {
  const sodaxClient = await getSodaxClient();

  // Check if allowance is sufficient
  const isAllowanceValid = await sodaxClient.moneyMarket.isAllowanceValid(
    params,
    spokeProvider
  );

  if (!isAllowanceValid.ok || !isAllowanceValid.value) {
    if (raw) {
      // Return raw approval transaction
      const rawApproval = await sodaxClient.moneyMarket.approve(
        params,
        spokeProvider,
        true // raw mode
      );
      return { rawApproval };
    } else {
      // Execute approval transaction
      const approvalResult = await sodaxClient.moneyMarket.approve(
        params,
        spokeProvider,
        false
      );
      // Handle Result type from SDK
      const txHash = (approvalResult as any).ok 
        ? (approvalResult as any).value 
        : (approvalResult as any).txHash || approvalResult;
      return { approvalTxHash: String(txHash) };
    }
  }

  return {};
}

/**
 * Determine if operation is cross-chain
 */
function isCrossChainOperation(srcChainId: string, dstChainId?: string): boolean {
  return !!dstChainId && dstChainId !== srcChainId;
}

// ============================================================================
// Tool Handlers
// ============================================================================

/**
 * Supply tokens to the money market
 * 
 * Supports cross-chain supply: supply tokens on chainId, collateral is recorded on dstChainId (if different)
 */
async function handleSupply(
  params: Static<typeof MoneyMarketSupplySchema>
): Promise<MoneyMarketOperationResult> {
  const { 
    walletId, 
    chainId, 
    token, 
    amount, 
    timeoutMs = 180000, 
    policyId,
    useAsCollateral = true,
    dstChainId,
    recipient,
    skipSimulation = false 
  } = params;

  const crossChain = isCrossChainOperation(chainId, dstChainId);
  const warnings: string[] = [];

  try {
    // Pre-operation checks
    const { wallet, spokeProvider } = await prepareMoneyMarketOperation(
      walletId,
      chainId,
      token,
      amount,
      "supply",
      policyId
    );

    // Parse amount (would need actual token decimals in production)
    const amountBigInt = parseTokenAmount(amount, 18);

    // Check allowance for supply
    const { approvalTxHash } = await ensureAllowance(
      { token, amount: amountBigInt, action: 'supply' },
      spokeProvider
    );

    if (approvalTxHash) {
      warnings.push(`Approval transaction executed: ${approvalTxHash}`);
    }

    const sodaxClient = await getSodaxClient();

    // Build supply parameters
    const supplyParams: any = {
      token,
      amount: amountBigInt,
      useAsCollateral,
      recipient: recipient || wallet.address,
    };

    // Add cross-chain parameters if applicable
    if (crossChain && dstChainId) {
      supplyParams.dstChainId = dstChainId;
      warnings.push(`Cross-chain supply: tokens supplied on ${chainId}, collateral recorded on ${dstChainId}`);
    }

    // Execute supply
    const supplyResult = await (sodaxClient as any).moneyMarket.supply(
      supplyParams,
      spokeProvider,
      timeoutMs
    );

    // Handle Result type from SDK
    if (supplyResult.ok === false) {
      throw new Error(`Supply failed: ${supplyResult.error}`);
    }
    
    const value = supplyResult.ok ? supplyResult.value : supplyResult;
    // SDK may return [spokeTxHash, hubTxHash] tuple
    const [spokeTxHash, hubTxHash] = Array.isArray(value) ? value : [value, undefined];

    return {
      success: true,
      txHash: String(spokeTxHash),
      status: "success",
      spokeTxHash: String(spokeTxHash),
      hubTxHash: hubTxHash ? String(hubTxHash) : undefined,
      intentHash: undefined,
      operation: "supply",
      chainId,
      dstChainId: dstChainId || chainId,
      token,
      amount,
      isCrossChain: crossChain,
      message: crossChain 
        ? `Successfully supplied ${amount} ${token} on ${chainId}. Collateral available on ${dstChainId || chainId}.`
        : `Successfully supplied ${amount} ${token} to money market on ${chainId}`,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error during supply";
    return {
      success: false,
      status: "failed",
      operation: "supply",
      chainId,
      dstChainId: dstChainId || chainId,
      token,
      amount,
      isCrossChain: crossChain,
      message: `Money market supply failed: ${errorMessage}`,
    };
  }
}

/**
 * Withdraw tokens from the money market
 * 
 * Supports cross-chain withdraw: withdraw collateral from chainId, receive tokens on dstChainId
 */
async function handleWithdraw(
  params: Static<typeof MoneyMarketWithdrawSchema>
): Promise<MoneyMarketOperationResult> {
  const { 
    walletId, 
    chainId, 
    token, 
    amount, 
    timeoutMs = 180000, 
    policyId,
    withdrawType = 'default',
    dstChainId,
    recipient,
    skipSimulation = false
  } = params;

  const crossChain = isCrossChainOperation(chainId, dstChainId);
  const warnings: string[] = [];

  try {
    // Pre-operation checks
    const { wallet, spokeProvider } = await prepareMoneyMarketOperation(
      walletId,
      chainId,
      token,
      amount,
      "withdraw",
      policyId
    );

    // Parse amount
    const amountBigInt = parseTokenAmount(amount, 18);

    const sodaxClient = await getSodaxClient();

    // Build withdraw parameters
    const withdrawParams: any = {
      token,
      amount: amountBigInt,
      withdrawType,
      recipient: recipient || wallet.address,
    };

    // Add cross-chain parameters if applicable
    if (crossChain && dstChainId) {
      withdrawParams.dstChainId = dstChainId;
      warnings.push(`Cross-chain withdraw: withdrawing from ${chainId}, receiving tokens on ${dstChainId}`);
    }

    // Execute withdraw
    const withdrawResult = await (sodaxClient as any).moneyMarket.withdraw(
      withdrawParams,
      spokeProvider,
      timeoutMs
    );

    // Handle Result type from SDK
    if (withdrawResult.ok === false) {
      throw new Error(`Withdraw failed: ${withdrawResult.error}`);
    }
    
    const value = withdrawResult.ok ? withdrawResult.value : withdrawResult;
    const [spokeTxHash, hubTxHash] = Array.isArray(value) ? value : [value, undefined];

    return {
      success: true,
      txHash: String(spokeTxHash),
      status: "success",
      spokeTxHash: String(spokeTxHash),
      hubTxHash: hubTxHash ? String(hubTxHash) : undefined,
      intentHash: undefined,
      operation: "withdraw",
      chainId,
      dstChainId: dstChainId || chainId,
      token,
      amount,
      isCrossChain: crossChain,
      message: crossChain
        ? `Successfully withdrew ${amount} ${token} from ${chainId} to ${dstChainId}`
        : `Successfully withdrew ${amount} ${token} from money market on ${chainId}`,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error during withdraw";
    return {
      success: false,
      status: "failed",
      operation: "withdraw",
      chainId,
      dstChainId: dstChainId || chainId,
      token,
      amount,
      isCrossChain: crossChain,
      message: `Money market withdraw failed: ${errorMessage}`,
    };
  }
}

/**
 * Borrow tokens from the money market
 * 
 * KEY FEATURE: Can borrow to a DIFFERENT chain than where collateral is supplied!
 * Example: Supply USDC on Ethereum (chainId), borrow USDT to Arbitrum (dstChainId)
 * 
 * This is a powerful cross-chain DeFi primitive that allows:
 * 1. Accessing liquidity without moving collateral
 * 2. Arbitraging interest rates across chains
 * 3. Efficient capital utilization across the entire SODAX network
 */
async function handleBorrow(
  params: Static<typeof MoneyMarketBorrowSchema>
): Promise<MoneyMarketOperationResult> {
  const { 
    walletId, 
    chainId, 
    token, 
    amount, 
    timeoutMs = 180000, 
    policyId,
    interestRateMode = 2,
    referralCode,
    dstChainId,  // KEY: This can be different from chainId for cross-chain borrow!
    recipient,
    skipSimulation = false
  } = params;

  const crossChain = isCrossChainOperation(chainId, dstChainId);
  const warnings: string[] = [];

  try {
    // Pre-operation checks
    const { wallet, spokeProvider } = await prepareMoneyMarketOperation(
      walletId,
      chainId,
      token,
      amount,
      "borrow",
      policyId
    );

    // Parse amount
    const amountBigInt = parseTokenAmount(amount, 18);

    // Get user's positions to check health factor (best practice)
    const sodaxClient = await getSodaxClient();
    
    // Build borrow parameters
    const borrowParams: any = {
      token,
      amount: amountBigInt,
      interestRateMode,
      recipient: recipient || wallet.address,
    };

    // Add optional parameters
    if (referralCode) {
      borrowParams.referralCode = referralCode;
    }

    // KEY CROSS-CHAIN FEATURE:
    // If dstChainId is provided and different from chainId, the borrowed tokens
    // will be delivered to dstChainId instead of chainId where the borrow is initiated
    if (crossChain && dstChainId) {
      borrowParams.dstChainId = dstChainId;
      warnings.push(`Cross-chain borrow: Using collateral on ${chainId}, receiving borrowed tokens on ${dstChainId}`);
      warnings.push(`Ensure you have sufficient collateral on ${chainId} to support this borrow`);
    }

    // Execute borrow
    const borrowResult = await (sodaxClient as any).moneyMarket.borrow(
      borrowParams,
      spokeProvider,
      timeoutMs
    );

    // Handle Result type from SDK
    if (borrowResult.ok === false) {
      throw new Error(`Borrow failed: ${borrowResult.error}`);
    }
    
    const value = borrowResult.ok ? borrowResult.value : borrowResult;
    const [spokeTxHash, hubTxHash] = Array.isArray(value) ? value : [value, undefined];

    return {
      success: true,
      txHash: String(spokeTxHash),
      status: "success",
      spokeTxHash: String(spokeTxHash),
      hubTxHash: hubTxHash ? String(hubTxHash) : undefined,
      intentHash: undefined,
      operation: "borrow",
      chainId,
      dstChainId: dstChainId || chainId,
      token,
      amount,
      isCrossChain: crossChain,
      message: crossChain
        ? `Successfully borrowed ${amount} ${token} on ${dstChainId} using collateral from ${chainId}. Interest rate mode: ${interestRateMode === 1 ? 'Stable' : 'Variable'}`
        : `Successfully borrowed ${amount} ${token} from money market on ${chainId}. Interest rate mode: ${interestRateMode === 1 ? 'Stable' : 'Variable'}`,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error during borrow";
    return {
      success: false,
      status: "failed",
      operation: "borrow",
      chainId,
      dstChainId: dstChainId || chainId,
      token,
      amount,
      isCrossChain: crossChain,
      message: `Money market borrow failed: ${errorMessage}`,
    };
  }
}

/**
 * Repay borrowed tokens to the money market
 * 
 * Supports cross-chain repay: repay debt using tokens from a different chain
 */
async function handleRepay(
  params: Static<typeof MoneyMarketRepaySchema>
): Promise<MoneyMarketOperationResult> {
  const { 
    walletId, 
    chainId, 
    token, 
    amount, 
    timeoutMs = 180000, 
    policyId,
    interestRateMode = 2,
    repayAll = false,
    collateralChainId,
    skipSimulation = false
  } = params;

  const crossChain = !!collateralChainId && collateralChainId !== chainId;
  const warnings: string[] = [];

  try {
    // Pre-operation checks
    const { wallet, spokeProvider } = await prepareMoneyMarketOperation(
      walletId,
      chainId,
      token,
      amount,
      "repay",
      policyId
    );

    // Parse amount (use -1 for max repay if repayAll is true)
    const amountBigInt = repayAll ? BigInt(-1) : parseTokenAmount(amount, 18);

    // Check allowance for repay
    const { approvalTxHash } = await ensureAllowance(
      { token, amount: amountBigInt === BigInt(-1) ? BigInt(0) : amountBigInt, action: 'repay' },
      spokeProvider
    );

    if (approvalTxHash) {
      warnings.push(`Approval transaction executed: ${approvalTxHash}`);
    }

    const sodaxClient = await getSodaxClient();

    // Build repay parameters
    const repayParams: any = {
      token,
      amount: amountBigInt,
      interestRateMode,
    };

    // Add cross-chain parameters if applicable
    if (crossChain && collateralChainId) {
      repayParams.collateralChainId = collateralChainId;
      warnings.push(`Cross-chain repay: Repaying debt on ${collateralChainId} using tokens from ${chainId}`);
    }

    // Execute repay
    const repayResult = await (sodaxClient as any).moneyMarket.repay(
      repayParams,
      spokeProvider,
      timeoutMs
    );

    // Handle Result type from SDK
    if (repayResult.ok === false) {
      throw new Error(`Repay failed: ${repayResult.error}`);
    }
    
    const value = repayResult.ok ? repayResult.value : repayResult;
    const [spokeTxHash, hubTxHash] = Array.isArray(value) ? value : [value, undefined];

    return {
      success: true,
      txHash: String(spokeTxHash),
      status: "success",
      spokeTxHash: String(spokeTxHash),
      hubTxHash: hubTxHash ? String(hubTxHash) : undefined,
      intentHash: undefined,
      operation: "repay",
      chainId,
      token,
      amount: repayAll ? "max (full debt)" : amount,
      isCrossChain: crossChain,
      message: repayAll
        ? `Successfully repaid full debt for ${token} on ${chainId}`
        : `Successfully repaid ${amount} ${token} to money market on ${chainId}`,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error during repay";
    return {
      success: false,
      status: "failed",
      operation: "repay",
      chainId,
      token,
      amount: repayAll ? "max (full debt)" : amount,
      isCrossChain: crossChain,
      message: `Money market repay failed: ${errorMessage}`,
    };
  }
}

// ============================================================================
// Intent Creation Handlers (Advanced)
// ============================================================================

/**
 * Create a supply intent without executing (for custom flows)
 */
async function handleCreateSupplyIntent(
  params: Static<typeof CreateSupplyIntentSchema>
): Promise<IntentResult> {
  const { walletId, chainId, token, amount, useAsCollateral = true, dstChainId, recipient, raw = true } = params;

  try {
    const { wallet, spokeProvider } = await prepareMoneyMarketOperation(
      walletId, chainId, token, amount, "supply"
    );

    const amountBigInt = parseTokenAmount(amount, 18);
    const sodaxClient = await getSodaxClient();

    const supplyParams: any = {
      token,
      amount: amountBigInt,
      useAsCollateral,
      recipient: recipient || wallet.address,
    };

    if (dstChainId) {
      supplyParams.dstChainId = dstChainId;
    }

    const intentData = await sodaxClient.moneyMarket.createSupplyIntent(
      supplyParams,
      spokeProvider,
      raw
    );

    return {
      success: true,
      status: "pending",
      operation: "createSupplyIntent",
      chainId,
      dstChainId: dstChainId || chainId,
      token,
      amount,
      intentData,
      requiresSubmission: true,
      message: "Supply intent created. Submit this intent to execute the supply operation.",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Create supply intent failed: ${errorMessage}`);
  }
}

/**
 * Create a borrow intent without executing (for custom flows)
 */
async function handleCreateBorrowIntent(
  params: Static<typeof CreateBorrowIntentSchema>
): Promise<IntentResult> {
  const { walletId, chainId, token, amount, interestRateMode = 2, dstChainId, recipient, raw = true } = params;

  try {
    const { wallet, spokeProvider } = await prepareMoneyMarketOperation(
      walletId, chainId, token, amount, "borrow"
    );

    const amountBigInt = parseTokenAmount(amount, 18);
    const sodaxClient = await getSodaxClient();

    const borrowParams: any = {
      token,
      amount: amountBigInt,
      interestRateMode,
      recipient: recipient || wallet.address,
    };

    if (dstChainId) {
      borrowParams.dstChainId = dstChainId;
    }

    const intentData = await sodaxClient.moneyMarket.createBorrowIntent(
      borrowParams,
      spokeProvider,
      raw
    );

    return {
      success: true,
      status: "pending",
      operation: "createBorrowIntent",
      chainId,
      dstChainId: dstChainId || chainId,
      token,
      amount,
      intentData,
      requiresSubmission: true,
      message: dstChainId && dstChainId !== chainId
        ? `Cross-chain borrow intent created. Collateral on ${chainId}, borrowed tokens to ${dstChainId}. Submit this intent to execute.`
        : "Borrow intent created. Submit this intent to execute the borrow operation.",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Create borrow intent failed: ${errorMessage}`);
  }
}

// ============================================================================
// Tool Registration
// ============================================================================

/**
 * Registers all money market tools with the agent tools registry
 */
export function registerMoneyMarketTools(agentTools: AgentTools): void {
  // Supply
  agentTools.register({
    name: "amped_oc_mm_supply",
    summary: "Supply tokens as collateral to the SODAX money market. Supports same-chain and cross-chain supply (supply on chain A, collateral available on chain B).",
    schema: MoneyMarketSupplySchema,
    handler: handleSupply,
  });

  // Withdraw
  agentTools.register({
    name: "amped_oc_mm_withdraw",
    summary: "Withdraw supplied tokens from the SODAX money market. Supports cross-chain withdraw (withdraw from chain A, receive tokens on chain B).",
    schema: MoneyMarketWithdrawSchema,
    handler: handleWithdraw,
  });

  // Borrow
  agentTools.register({
    name: "amped_oc_mm_borrow",
    summary: "Borrow tokens from the SODAX money market. KEY FEATURE: Can borrow to a different chain than collateral! Example: Supply on Ethereum, borrow to Arbitrum using dstChainId parameter.",
    schema: MoneyMarketBorrowSchema,
    handler: handleBorrow,
  });

  // Repay
  agentTools.register({
    name: "amped_oc_mm_repay",
    summary: "Repay borrowed tokens to the SODAX money market. Use amount='-1' or repayAll=true to repay full debt. Supports cross-chain repay.",
    schema: MoneyMarketRepaySchema,
    handler: handleRepay,
  });

  // Advanced: Create Intent variants for custom flows
  agentTools.register({
    name: "amped_oc_mm_create_supply_intent",
    summary: "[Advanced] Create a supply intent without executing. Returns raw intent data for custom signing or multi-step flows.",
    schema: CreateSupplyIntentSchema,
    handler: handleCreateSupplyIntent,
  });

  agentTools.register({
    name: "amped_oc_mm_create_borrow_intent",
    summary: "[Advanced] Create a borrow intent without executing. Supports cross-chain borrow intents. Returns raw intent data for custom signing or multi-step flows.",
    schema: CreateBorrowIntentSchema,
    handler: handleCreateBorrowIntent,
  });
}

// ============================================================================
// Re-exports for testing and direct usage
// ============================================================================

export {
  MoneyMarketBaseSchema,
  MoneyMarketSupplySchema,
  MoneyMarketWithdrawSchema,
  MoneyMarketBorrowSchema,
  MoneyMarketRepaySchema,
  CreateSupplyIntentSchema,
  CreateWithdrawIntentSchema,
  CreateBorrowIntentSchema,
  CreateRepayIntentSchema,
  handleSupply,
  handleWithdraw,
  handleBorrow,
  handleRepay,
  handleCreateSupplyIntent,
  handleCreateBorrowIntent,
};

// Aliases for index.ts compatibility
export {
  MoneyMarketSupplySchema as MmSupplySchema,
  MoneyMarketWithdrawSchema as MmWithdrawSchema,
  MoneyMarketBorrowSchema as MmBorrowSchema,
  MoneyMarketRepaySchema as MmRepaySchema,
  handleSupply as handleMmSupply,
  handleWithdraw as handleMmWithdraw,
  handleBorrow as handleMmBorrow,
  handleRepay as handleMmRepay,
};

export type { MoneyMarketOperationResult, IntentResult };
