/**
 * Money Market Tools for Amped DeFi Plugin
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
import { getWalletManager } from '../wallet/walletManager';
import { AgentTools } from "../types";
import { serializeError } from '../utils/errorUtils';
import { resolveToken, getTokenInfo } from '../utils/tokenResolver';
import { toSodaxChainId } from '../wallet/types';
import { parseUnits } from 'viem';

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
    description: "Amount in human-readable units (e.g., '100.5' for 100.5 USDC).",
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

const MAX_UINT256 = (2n ** 256n) - 1n;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Converts human-readable amount to token units (wei)
 */
function parseTokenAmount(amount: string, decimals: number = 18): bigint {
  return parseUnits(amount, decimals);
}

/**
 * Resolves wallet and creates spoke provider for the operation
 */
async function resolveWalletAndProvider(
  walletId: string,
  chainId: string
): Promise<{
  walletAddress: string;
  spokeProvider: any;
}> {
  const walletManager = getWalletManager();
  const wallet = await walletManager.resolve(walletId);
  const walletAddress = await wallet.getAddress();

  const spokeProvider = await getSpokeProvider(walletId, chainId);

  return { walletAddress, spokeProvider };
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
): Promise<{ walletAddress: string; spokeProvider: any; policyResult: any; tokenAddr: string }> {
  // Ensure sodax client is initialized
  const _sodaxClient = getSodaxClient(); // Just verify it's ready
  void _sodaxClient;

  // Normalize chain ID to SDK format for token resolution
  const sdkChainId = toSodaxChainId(chainId);

  // Resolve token symbol to address
  const tokenAddr = await resolveToken(sdkChainId, token);

  // Resolve wallet and create spoke provider
  const { walletAddress, spokeProvider } = await resolveWalletAndProvider(walletId, chainId);

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

  return { walletAddress, spokeProvider, policyResult, tokenAddr };
}
/**
 * Resolves token and returns its decimals
 * Falls back to 18 decimals if token info not found
 */
async function getTokenDecimals(
  chainId: string,
  token: string
): Promise<number> {
  try {
    const sdkChainId = toSodaxChainId(chainId);
    const tokenInfo = await getTokenInfo(sdkChainId, token);
    return tokenInfo?.decimals ?? 18;
  } catch {
    // If token info lookup fails, fall back to 18 decimals
    return 18;
  }
}

function getReserveValue<T = unknown>(reserve: any, keys: string[]): T | undefined {
  for (const key of keys) {
    if (reserve?.[key] !== undefined) return reserve[key] as T;
    if (reserve?.reserve?.[key] !== undefined) return reserve.reserve[key] as T;
    if (reserve?.token?.[key] !== undefined) return reserve.token[key] as T;
  }
  return undefined;
}

async function normalizeWithdrawTokenAddress(
  sourceChainId: string,
  targetChainId: string,
  tokenInput: string,
  resolvedTokenAddr: string
): Promise<string> {
  const sodaxClient = await getSodaxClient();
  const config = (sodaxClient as any).config;
  const mmChainId = toSodaxChainId(targetChainId);
  const lcInput = tokenInput.toLowerCase();

  const isSupported = (tokenAddr: string): boolean => {
    if (!config?.isMoneyMarketSupportedToken) return true;
    return !!config.isMoneyMarketSupportedToken(mmChainId, tokenAddr);
  };

  if (isSupported(resolvedTokenAddr)) {
    return resolvedTokenAddr;
  }

  // Try resolving token against destination chain first (frontend effectively does this via constrained UI selection).
  try {
    const dstResolved = await resolveToken(targetChainId, tokenInput);
    if (isSupported(dstResolved)) {
      return dstResolved;
    }
  } catch {
    // Fall through to reserve-based mapping.
  }

  // Fallback: map aToken-style token to underlying from reserves metadata.
  try {
    const reservesResult = await (sodaxClient as any).moneyMarket?.data?.getReservesHumanized?.();
    const reserves = Array.isArray(reservesResult) ? reservesResult : (reservesResult?.reservesData ?? []);
    for (const reserve of reserves) {
      const reserveChain = getReserveValue<string>(reserve, ['chainId', 'xChainId', 'tokenSrcBlockchainId']);
      if (reserveChain && toSodaxChainId(String(reserveChain)) !== mmChainId) {
        continue;
      }

      const underlying = getReserveValue<string>(reserve, ['underlyingAsset', 'address']);
      const aTokenAddress = getReserveValue<string>(reserve, ['aTokenAddress', 'aToken']);
      const symbol = getReserveValue<string>(reserve, ['symbol'])?.toLowerCase();
      const aTokenSymbol = getReserveValue<string>(reserve, ['aTokenSymbol'])?.toLowerCase();
      if (!underlying) continue;

      const lcUnderlying = String(underlying).toLowerCase();
      const lcATokenAddr = aTokenAddress ? String(aTokenAddress).toLowerCase() : '';
      const sodaSymbol = symbol ? `soda${symbol}` : '';

      const matchesATokenAddr = lcATokenAddr && (lcInput === lcATokenAddr || resolvedTokenAddr.toLowerCase() === lcATokenAddr);
      const matchesATokenSymbol = !!(aTokenSymbol && lcInput === aTokenSymbol);
      const matchesSodaSymbol = !!(sodaSymbol && lcInput === sodaSymbol);

      if ((matchesATokenAddr || matchesATokenSymbol || matchesSodaSymbol) && isSupported(lcUnderlying)) {
        return lcUnderlying;
      }
    }
  } catch {
    // Ignore reserve mapping errors and throw clearer unsupported token message below.
  }

  throw new Error(
    `Unsupported money market withdraw token on ${targetChainId}: ${tokenInput}. ` +
    `Use the underlying money market token for the destination chain.`
  );
}


/**
 * Checks and handles token approval if needed
 */
async function ensureAllowance(
  params: {
    token: string;
    amount: bigint;
    action: 'supply' | 'withdraw' | 'borrow' | 'repay';
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

  if (isAllowanceValid.ok === false) {
    throw new Error(`Failed to check allowance: ${serializeError(isAllowanceValid.error)}`);
  }

  if (!isAllowanceValid.value) {
    if (raw) {
      const rawApproval = await sodaxClient.moneyMarket.approve(params, spokeProvider, true);
      return { rawApproval };
    }

    const approvalResult = await sodaxClient.moneyMarket.approve(params, spokeProvider, false);
    if (approvalResult.ok === false) {
      throw new Error(`Approval failed: ${serializeError(approvalResult.error)}`);
    }
    const approvalTxHash = approvalResult.value;
    if (approvalTxHash && spokeProvider.walletProvider?.waitForTransactionReceipt) {
      await spokeProvider.walletProvider.waitForTransactionReceipt(approvalTxHash);
    }
    return { approvalTxHash: String(approvalTxHash) };
  }

  return {};
}

function parseRelayTxHashes(value: unknown): {
  spokeTxHash: string;
  hubTxHash?: string;
  dstTxHash?: string;
} {
  if (Array.isArray(value)) {
    const [first, second, third] = value;
    if (typeof first === 'string' && typeof second === 'string') {
      return { spokeTxHash: first, hubTxHash: second };
    }
    const deliveryInfo = third as any;
    const spokeTxHash = deliveryInfo?.srcTxHash || (first as any)?.txHash || first;
    const hubTxHash = deliveryInfo?.hubTxHash || (second as any)?.hubTxHash;
    const dstTxHash = deliveryInfo?.dstTxHash;
    return {
      spokeTxHash: String(spokeTxHash),
      hubTxHash: hubTxHash ? String(hubTxHash) : undefined,
      dstTxHash: dstTxHash ? String(dstTxHash) : undefined,
    };
  }

  const asAny = value as any;
  return {
    spokeTxHash: String(asAny?.srcTxHash || asAny?.txHash || value),
    hubTxHash: asAny?.hubTxHash ? String(asAny.hubTxHash) : undefined,
    dstTxHash: asAny?.dstTxHash ? String(asAny.dstTxHash) : undefined,
  };
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
  if (skipSimulation) {
    warnings.push('skipSimulation is not supported by the current SDK flow and was ignored.');
  }

  try {
    // Pre-operation checks
    const { walletAddress, spokeProvider, tokenAddr } = await prepareMoneyMarketOperation(
      walletId,
      chainId,
      token,
      amount,
      "supply",
      policyId
    );

    // Parse amount with actual token decimals
    const decimals = await getTokenDecimals(chainId, token);
    const amountBigInt = parseTokenAmount(amount, decimals);

    // Frontend-aligned flow: check allowance and approve when required.
    const { approvalTxHash } = await ensureAllowance(
      { token: tokenAddr, amount: amountBigInt, action: 'supply' },
      spokeProvider
    );

    if (approvalTxHash) {
      warnings.push(`Approval transaction executed: ${approvalTxHash}`);
    }

    const sodaxClient = await getSodaxClient();

    // Build supply parameters
    const supplyParams: any = {
      action: 'supply',
      token: tokenAddr,
      amount: amountBigInt,
      
      toAddress: recipient || walletAddress,
    };

    // Add cross-chain parameters if applicable
    if (crossChain && dstChainId) {
      supplyParams.toChainId = toSodaxChainId(dstChainId);
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
      throw new Error(`Supply failed: ${serializeError(supplyResult.error)}`);
    }
    
    const value = supplyResult.ok ? supplyResult.value : supplyResult;
    const { spokeTxHash, hubTxHash } = parseRelayTxHashes(value);

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
  if (skipSimulation) {
    warnings.push('skipSimulation is not supported by the current SDK flow and was ignored.');
  }

  try {
    // Pre-operation checks
    const { walletAddress, spokeProvider, tokenAddr } = await prepareMoneyMarketOperation(
      walletId,
      chainId,
      token,
      amount,
      "withdraw",
      policyId
    );

    // Parse amount with actual token decimals
    const decimals = await getTokenDecimals(chainId, token);
    const amountBigInt = withdrawType === 'all' ? MAX_UINT256 : parseTokenAmount(amount, decimals);

    const sodaxClient = await getSodaxClient();
    const effectiveDstChainId = dstChainId || chainId;
    const withdrawTokenAddr = await normalizeWithdrawTokenAddress(
      chainId,
      effectiveDstChainId,
      token,
      tokenAddr
    );

    // Build withdraw parameters
    const withdrawParams: any = {
      action: 'withdraw',
      token: withdrawTokenAddr,
      amount: amountBigInt,
      
      toAddress: recipient || walletAddress,
    };

    // Add cross-chain parameters if applicable
    if (crossChain && dstChainId) {
      withdrawParams.toChainId = toSodaxChainId(dstChainId);
      warnings.push(`Cross-chain withdraw: withdrawing from ${chainId}, receiving tokens on ${dstChainId}`);
    }

    if (withdrawType === 'collateral') {
      warnings.push("withdrawType='collateral' is not a distinct SDK mode; using standard withdraw.");
    }
    const { approvalTxHash } = await ensureAllowance(
      { token: withdrawTokenAddr, amount: amountBigInt, action: 'withdraw' },
      spokeProvider
    );
    if (approvalTxHash) warnings.push(`Approval transaction executed: ${approvalTxHash}`);

    // Execute withdraw
    const withdrawResult = await (sodaxClient as any).moneyMarket.withdraw(
      withdrawParams,
      spokeProvider,
      timeoutMs
    );

    // Handle Result type from SDK
    if (withdrawResult.ok === false) {
      throw new Error(`Withdraw failed: ${serializeError(withdrawResult.error)}`);
    }
    
    const value = withdrawResult.ok ? withdrawResult.value : withdrawResult;
    const { spokeTxHash, hubTxHash } = parseRelayTxHashes(value);

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
  if (skipSimulation) {
    warnings.push('skipSimulation is not supported by the current SDK flow and was ignored.');
  }

  try {
    // Pre-operation checks
    const { walletAddress, spokeProvider, tokenAddr } = await prepareMoneyMarketOperation(
      walletId,
      chainId,
      token,
      amount,
      "borrow",
      policyId
    );

    // Parse amount with actual token decimals
    const decimals = await getTokenDecimals(chainId, token);
    const amountBigInt = parseTokenAmount(amount, decimals);

    // Get user's positions to check health factor (best practice)
    const sodaxClient = await getSodaxClient();
    
    // For cross-chain borrow, resolve token on DESTINATION chain
    // SDK expects: getMoneyMarketToken(toChainId, params.token)
    // So params.token must be the destination chain's token address
    let borrowTokenAddr = tokenAddr;
    if (crossChain && dstChainId) {
      borrowTokenAddr = await resolveToken(dstChainId, token);
      console.log('[mm:borrow] Cross-chain: resolved token on destination chain', {
        srcChain: chainId,
        dstChain: dstChainId,
        srcTokenAddr: tokenAddr,
        dstTokenAddr: borrowTokenAddr,
      });
    }

    // Build borrow parameters
    const borrowParams: any = {
      action: 'borrow',
      token: borrowTokenAddr,
      amount: amountBigInt,
      
      toAddress: recipient || walletAddress,
    };

    // KEY CROSS-CHAIN FEATURE:
    // If dstChainId is provided and different from chainId, the borrowed tokens
    // will be delivered to dstChainId instead of chainId where the borrow is initiated
    if (crossChain && dstChainId) {
      borrowParams.toChainId = toSodaxChainId(dstChainId);
      warnings.push(`Cross-chain borrow: Using collateral on ${chainId}, receiving borrowed tokens on ${dstChainId}`);
      warnings.push(`Ensure you have sufficient collateral on ${chainId} to support this borrow`);
    }

    const { approvalTxHash } = await ensureAllowance(
      { token: borrowTokenAddr, amount: amountBigInt, action: 'borrow' },
      spokeProvider
    );
    if (approvalTxHash) warnings.push(`Approval transaction executed: ${approvalTxHash}`);

    // Execute borrow
    const borrowResult = await (sodaxClient as any).moneyMarket.borrow(
      borrowParams,
      spokeProvider,
      timeoutMs
    );

    // Handle Result type from SDK
    if (borrowResult.ok === false) {
      throw new Error(`Borrow failed: ${serializeError(borrowResult.error)}`);
    }
    
    const value = borrowResult.ok ? borrowResult.value : borrowResult;
    const { spokeTxHash, hubTxHash } = parseRelayTxHashes(value);

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
  if (skipSimulation) {
    warnings.push('skipSimulation is not supported by the current SDK flow and was ignored.');
  }

  try {
    // Pre-operation checks
    const { walletAddress, spokeProvider, tokenAddr } = await prepareMoneyMarketOperation(
      walletId,
      chainId,
      token,
      amount,
      "repay",
      policyId
    );

    // Parse amount with actual token decimals.
    // For repay-all, SDK expects uint256 max rather than negative sentinel values.
    const decimals = await getTokenDecimals(chainId, token);
    const amountBigInt = repayAll ? MAX_UINT256 : parseTokenAmount(amount, decimals);

    // Frontend-aligned flow: check allowance and approve when required.
    const { approvalTxHash } = await ensureAllowance(
      { token: tokenAddr, amount: amountBigInt, action: 'repay' },
      spokeProvider
    );

    if (approvalTxHash) {
      warnings.push(`Approval transaction executed: ${approvalTxHash}`);
    }

    const sodaxClient = await getSodaxClient();

    // Build repay parameters
    const repayParams: any = {
      action: 'repay',
      token: tokenAddr,
      amount: amountBigInt,
      
    };

    // Add cross-chain parameters if applicable
    if (crossChain && collateralChainId) {
      repayParams.toChainId = toSodaxChainId(collateralChainId);
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
      throw new Error(`Repay failed: ${serializeError(repayResult.error)}`);
    }
    
    const value = repayResult.ok ? repayResult.value : repayResult;
    const { spokeTxHash, hubTxHash } = parseRelayTxHashes(value);

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
    const { walletAddress, spokeProvider, tokenAddr } = await prepareMoneyMarketOperation(
      walletId, chainId, token, amount, "supply"
    );

    const decimals = await getTokenDecimals(chainId, token);
    const amountBigInt = parseTokenAmount(amount, decimals);
    const sodaxClient = await getSodaxClient();

    const supplyParams: any = {
      action: 'supply',
      token: tokenAddr,
      amount: amountBigInt,
      
      toAddress: recipient || walletAddress,
    };

    if (dstChainId) {
      supplyParams.toChainId = toSodaxChainId(dstChainId);
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
    const { walletAddress, spokeProvider, tokenAddr } = await prepareMoneyMarketOperation(
      walletId, chainId, token, amount, "borrow"
    );

    const decimals = await getTokenDecimals(chainId, token);
    const amountBigInt = parseTokenAmount(amount, decimals);
    const sodaxClient = await getSodaxClient();

    const borrowParams: any = {
      action: 'borrow',
      token: tokenAddr,
      amount: amountBigInt,
      
      toAddress: recipient || walletAddress,
    };

    if (dstChainId) {
      borrowParams.toChainId = toSodaxChainId(dstChainId);
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
    name: "amped_mm_supply",
    summary: "Supply tokens as collateral to the SODAX money market. Supports same-chain and cross-chain supply (supply on chain A, collateral available on chain B).",
    schema: MoneyMarketSupplySchema,
    handler: handleSupply,
  });

  // Withdraw
  agentTools.register({
    name: "amped_mm_withdraw",
    summary: "Withdraw supplied tokens from the SODAX money market. Supports cross-chain withdraw (withdraw from chain A, receive tokens on chain B).",
    schema: MoneyMarketWithdrawSchema,
    handler: handleWithdraw,
  });

  // Borrow
  agentTools.register({
    name: "amped_mm_borrow",
    summary: "Borrow tokens from the SODAX money market. KEY FEATURE: Can borrow to a different chain than collateral! Example: Supply on Ethereum, borrow to Arbitrum using dstChainId parameter.",
    schema: MoneyMarketBorrowSchema,
    handler: handleBorrow,
  });

  // Repay
  agentTools.register({
    name: "amped_mm_repay",
    summary: "Repay borrowed tokens to the SODAX money market. Use repayAll=true to repay full debt. Supports cross-chain repay.",
    schema: MoneyMarketRepaySchema,
    handler: handleRepay,
  });

  // Advanced: Create Intent variants for custom flows
  agentTools.register({
    name: "amped_mm_create_supply_intent",
    summary: "[Advanced] Create a supply intent without executing. Returns raw intent data for custom signing or multi-step flows.",
    schema: CreateSupplyIntentSchema,
    handler: handleCreateSupplyIntent,
  });

  agentTools.register({
    name: "amped_mm_create_borrow_intent",
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
