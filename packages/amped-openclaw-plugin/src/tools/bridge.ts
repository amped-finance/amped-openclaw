/**
 * Bridge Tools for Amped OpenClaw Plugin
 *
 * Provides tools for cross-chain token bridging via SODAX SDK:
 * - amped_oc_bridge_discover: Get bridgeable tokens for a route
 * - amped_oc_bridge_quote: Check bridgeability and max amounts
 * - amped_oc_bridge_execute: Execute bridge with allowance check and approval
 *
 * @module tools/bridge
 */

import { Static, Type } from '@sinclair/typebox';
import { AgentTools, BridgeOperation } from '../types';
import { getSodaxClient } from '../sodax/client';
import { getSpokeProvider } from '../providers/spokeProviderFactory';
import { PolicyEngine } from '../policy/policyEngine';
import { getWalletManager } from '../wallet/walletManager';
import { serializeError } from '../utils/errorUtils';
import { resolveToken } from '../utils/tokenResolver';

// ============================================================================
// TypeBox Schemas
// ============================================================================

/**
 * Schema for amped_oc_bridge_discover tool
 * Discover bridgeable tokens for a given source chain, destination chain, and source token
 */
const BridgeDiscoverSchema = Type.Object({
  srcChainId: Type.String({
    description: 'Source chain ID (e.g., "ethereum", "arbitrum")',
  }),
  dstChainId: Type.String({
    description: 'Destination chain ID (e.g., "sonic", "optimism")',
  }),
  srcToken: Type.String({
    description: 'Source token address or symbol',
  }),
});

/**
 * Schema for amped_oc_bridge_quote tool
 * Check if a bridge route is valid and get maximum bridgeable amount
 */
const BridgeQuoteSchema = Type.Object({
  srcChainId: Type.String({
    description: 'Source chain ID',
  }),
  dstChainId: Type.String({
    description: 'Destination chain ID',
  }),
  srcToken: Type.String({
    description: 'Source token address or symbol',
  }),
  dstToken: Type.String({
    description: 'Destination token address or symbol',
  }),
});

/**
 * Schema for amped_oc_bridge_execute tool
 * Execute a bridge operation with full allowance check and approval flow
 */
const BridgeExecuteSchema = Type.Object({
  walletId: Type.String({
    description: 'Unique identifier for the wallet to use',
  }),
  srcChainId: Type.String({
    description: 'Source chain ID',
  }),
  dstChainId: Type.String({
    description: 'Destination chain ID',
  }),
  srcToken: Type.String({
    description: 'Source token address or symbol to bridge from',
  }),
  dstToken: Type.String({
    description: 'Destination token address or symbol to bridge to',
  }),
  amount: Type.String({
    description: 'Amount to bridge in human-readable units (e.g., "100.5")',
  }),
  recipient: Type.Optional(
    Type.String({
      description: 'Recipient address on destination chain (defaults to wallet address)',
    })
  ),
  timeoutMs: Type.Optional(
    Type.Number({
      description: 'Timeout for bridge operation in milliseconds',
      default: 300000, // 5 minutes
    })
  ),
  policyId: Type.Optional(
    Type.String({
      description: 'Optional policy profile ID for custom limits',
    })
  ),
});

// Type inference from schemas
type BridgeDiscoverParams = Static<typeof BridgeDiscoverSchema>;
type BridgeQuoteParams = Static<typeof BridgeQuoteSchema>;
type BridgeExecuteParams = Static<typeof BridgeExecuteSchema>;

// ============================================================================
// Bridge Discover Tool
// ============================================================================

/**
 * Transaction result type for bridge execute
 */
interface TransactionResult {
  spokeTxHash: string;
  hubTxHash?: string;
}

/**
 * Handler for amped_oc_bridge_discover
 * Retrieves tokens that can be bridged from the source chain to destination chain
 *
 * @param params - Discovery parameters (srcChainId, dstChainId, srcToken)
 * @returns List of bridgeable tokens
 */
async function handleBridgeDiscover(
  params: BridgeDiscoverParams
): Promise<{ bridgeableTokens: string[] }> {
  const { srcChainId, dstChainId, srcToken } = params;

    // Resolve token symbol to address
    const srcTokenAddr = await resolveToken(srcChainId, srcToken);

  console.log('[bridge:discover] Discovering bridgeable tokens', {
    srcChainId,
    dstChainId,
    srcToken,
  });

  try {
    const sodax = getSodaxClient();

    // Get bridgeable tokens from SODAX SDK
    // SDK API: getBridgeableTokens(from: SpokeChainId, to: SpokeChainId, token: string)
    const result = sodax.bridge.getBridgeableTokens(
      srcChainId as any,
      dstChainId as any,
      srcTokenAddr
    );

    // Handle Result type - SDK returns Result<XToken[], unknown>
    if (!result.ok) {
      throw new Error(`Failed to get bridgeable tokens: ${serializeError((result as any).error) || 'Unknown error'}`);
    }

    const tokens = result.value;
    const bridgeableTokens = tokens.map((t: any) => t.address || t.symbol || String(t));

    console.log('[bridge:discover] Found bridgeable tokens', {
      count: bridgeableTokens.length,
      tokens: bridgeableTokens,
    });

    return { bridgeableTokens };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[bridge:discover] Failed to discover bridgeable tokens', {
      error: errorMessage,
      srcChainId,
      dstChainId,
      srcToken,
    });
    throw new Error(`Failed to discover bridgeable tokens: ${errorMessage}`);
  }
}

// ============================================================================
// Bridge Quote Tool
// ============================================================================

/**
 * Handler for amped_oc_bridge_quote
 * Checks if a bridge route is valid and returns the maximum bridgeable amount
 *
 * @param params - Quote parameters (srcChainId, dstChainId, srcToken, dstToken)
 * @returns Bridgeability status and maximum amount
 */
async function handleBridgeQuote(
  params: BridgeQuoteParams
): Promise<{ isBridgeable: boolean; maxBridgeableAmount: string }> {
  const { srcChainId, dstChainId, srcToken, dstToken } = params;

    // Resolve token symbols to addresses
    const srcTokenAddr = await resolveToken(srcChainId, srcToken);
    const dstTokenAddr = await resolveToken(dstChainId, dstToken);

  console.log('[bridge:quote] Checking bridge quote', {
    srcChainId,
    dstChainId,
    srcToken,
    dstToken,
  });

  try {
    const sodax = getSodaxClient();

    // Create XToken objects for the SDK
    const fromToken = { chainId: srcChainId, address: srcTokenAddr } as any;
    const toToken = { chainId: dstChainId, address: dstTokenAddr } as any;

    // Check if the route is bridgeable using isBridgeable
    // SDK may have different signature - adapting based on available methods
    let isBridgeable = false;
    try {
      // Try to get bridgeable tokens to check if route exists
      const result = sodax.bridge.getBridgeableTokens(
        srcChainId as any,
        dstChainId as any,
        srcTokenAddr
      );
      if (result.ok && result.value.length > 0) {
        isBridgeable = result.value.some((t: any) => 
          t.address?.toLowerCase() === dstTokenAddr.toLowerCase() ||
          t === dstTokenAddr
        );
      }
    } catch {
      isBridgeable = false;
    }

    // Get maximum bridgeable amount
    let maxBridgeableAmount = '0';
    if (isBridgeable) {
      try {
        // SDK API: getBridgeableAmount(from: XToken, to: XToken)
        const maxAmountResult = await sodax.bridge.getBridgeableAmount(fromToken, toToken);
        if (maxAmountResult.ok) {
          const val = maxAmountResult.value as any;
          // BridgeLimit may have different property names depending on SDK version
          maxBridgeableAmount = val?.max?.toString() || 
                                val?.maxAmount?.toString() ||
                                val?.limit?.toString() ||
                                val?.toString() || '0';
        }
      } catch (e) {
        console.warn('[bridge:quote] Could not get max bridgeable amount:', e);
      }
    }

    console.log('[bridge:quote] Bridge quote result', {
      isBridgeable,
      maxBridgeableAmount,
    });

    return { isBridgeable, maxBridgeableAmount };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[bridge:quote] Failed to get bridge quote', {
      error: errorMessage,
      srcChainId,
      dstChainId,
      srcToken,
      dstToken,
    });
    throw new Error(`Failed to get bridge quote: ${errorMessage}`);
  }
}

// ============================================================================
// Bridge Execute Tool
// ============================================================================

/**
 * Handler for amped_oc_bridge_execute
 * Executes a bridge operation with full allowance check and approval flow
 *
 * Flow:
 *   1. Policy check via PolicyEngine
 *   2. Get spoke provider for wallet
 *   3. Check token allowance via isAllowanceValid
 *   4. Approve tokens if needed
 *   5. Execute bridge operation
 *
 * @param params - Execution parameters
 * @returns Transaction hashes (spoke and hub)
 */
async function handleBridgeExecute(
  params: BridgeExecuteParams
): Promise<TransactionResult> {
  const {
    walletId,
    srcChainId,
    dstChainId,
    srcToken,
    dstToken,
    amount,
    recipient,
    timeoutMs = 300000, // Default 5 minutes
    policyId,
  } = params;

    // Resolve token symbols to addresses
    const srcTokenAddr = await resolveToken(srcChainId, srcToken);
    const dstTokenAddr = await resolveToken(dstChainId, dstToken);

  console.log('[bridge:execute] Starting bridge execution', {
    walletId,
    srcChainId,
    dstChainId,
    srcToken,
    dstToken,
    amount,
    recipient,
    timeoutMs,
    policyId,
  });

  try {
    const sodax = getSodaxClient();
    const policyEngine = new PolicyEngine();
    const walletManager = getWalletManager();

    // Step 1: Resolve wallet
    const wallet = await walletManager.resolve(walletId);
    if (!wallet) {
      throw new Error(`Wallet not found: ${walletId}`);
    }

    // Step 2: Policy check
    const bridgeOp: BridgeOperation = {
      walletId,
      srcChainId,
      dstChainId,
      srcToken,
      dstToken,
      amount,
      recipient,
      timeoutMs,
      policyId,
    };

    const policyCheck = await policyEngine.checkBridge(bridgeOp);
    if (!policyCheck.allowed) {
      throw new Error(`Policy check failed: ${policyCheck.reason}`);
    }

    console.log('[bridge:execute] Policy check passed');

    // Step 3: Get spoke provider for source chain
    const spokeProvider = await getSpokeProvider(walletId, srcChainId);

    // Create XToken objects for the SDK
    const fromToken = { chainId: srcChainId, address: srcTokenAddr } as any;
    const toToken = { chainId: dstChainId, address: dstTokenAddr } as any;

    // Step 4: Check if allowance is valid for the bridge amount
    // SDK may have different API - adapting to common patterns
    let isAllowanceValid = false;
    try {
      const allowanceResult = await (sodax.bridge as any).isAllowanceValid(
        fromToken,
        spokeProvider,
        amount
      );
      isAllowanceValid = allowanceResult?.ok ? allowanceResult.value : allowanceResult;
    } catch {
      // If method doesn't exist, assume we need to approve
      isAllowanceValid = false;
    }

    // Step 5: Approve if allowance is insufficient
    if (!isAllowanceValid) {
      console.log('[bridge:execute] Insufficient allowance, approving tokens', {
        srcChainId,
        srcToken,
        amount,
      });

      try {
        const approvalResult = await (sodax.bridge as any).approve(
          fromToken,
          spokeProvider,
          amount
        );
        const approvalTxHash = approvalResult?.ok ? approvalResult.value : approvalResult;

        console.log('[bridge:execute] Approval transaction submitted', {
          approvalTxHash,
        });
      } catch (approvalError) {
        console.warn('[bridge:execute] Approval may have failed:', approvalError);
      }
    } else {
      console.log('[bridge:execute] Allowance is sufficient');
    }

    // Step 6: Execute the bridge operation
    console.log('[bridge:execute] Executing bridge operation', {
      srcChainId,
      dstChainId,
      srcToken,
      dstToken,
      amount,
      recipient,
    });

    // SDK bridge API - adapting to expected signature
    const bridgeParams = {
      params: {
        from: fromToken,
        to: toToken,
        amount,
        recipient: recipient || wallet.address,
      },
      spokeProvider,
      timeout: timeoutMs,
    };

    const result = await (sodax.bridge as any).bridge(bridgeParams);

    // Handle Result type from SDK
    if (result.ok === false) {
      throw new Error(`Bridge failed: ${serializeError(result.error)}`);
    }

    // SODAX bridge returns Result<[spokeTxHash, hubTxHash], Error>
    const value = result.ok ? result.value : result;
    const [spokeTxHash, hubTxHash] = Array.isArray(value) ? value : [value, undefined];

    console.log('[bridge:execute] Bridge operation completed', {
      spokeTxHash,
      hubTxHash,
    });

    return {
      spokeTxHash: String(spokeTxHash),
      hubTxHash: hubTxHash ? String(hubTxHash) : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[bridge:execute] Bridge execution failed', {
      error: errorMessage,
      walletId,
      srcChainId,
      dstChainId,
      srcToken,
      dstToken,
      amount,
    });
    throw new Error(`Bridge execution failed: ${errorMessage}`);
  }
}

// ============================================================================
// Tool Registration
// ============================================================================

/**
 * Register all bridge tools with the agent tools registry
 *
 * @param agentTools - The agent tools registry
 */
export function registerBridgeTools(agentTools: AgentTools): void {
  // Register bridge discover tool
  agentTools.register({
    name: 'amped_oc_bridge_discover',
    summary: 'Discover bridgeable tokens for a given source chain and token',
    description:
      'Retrieves a list of tokens that can be bridged from the specified source chain ' +
      'to the destination chain, starting from a specific source token. ' +
      'Use this to find valid bridge routes before requesting a quote.',
    schema: BridgeDiscoverSchema,
    handler: handleBridgeDiscover,
  });

  console.log('[bridge] Registered tool: amped_oc_bridge_discover');

  // Register bridge quote tool
  agentTools.register({
    name: 'amped_oc_bridge_quote',
    summary: 'Check bridgeability and get maximum bridgeable amount',
    description:
      'Validates whether a specific bridge route (source chain/token → destination chain/token) ' +
      'is supported and returns the maximum amount that can be bridged. ' +
      'Always call this before executing a bridge to verify the route is valid.',
    schema: BridgeQuoteSchema,
    handler: handleBridgeQuote,
  });

  console.log('[bridge] Registered tool: amped_oc_bridge_quote');

  // Register bridge execute tool
  agentTools.register({
    name: 'amped_oc_bridge_execute',
    summary: 'Execute a cross-chain bridge operation',
    description:
      'Executes a bridge operation that moves tokens from a source chain to a destination chain. ' +
      'This tool handles the complete flow: policy validation, allowance checking, ' +
      'token approval (if needed), and bridge execution. ' +
      'Returns transaction hashes for both the spoke chain and hub chain.',
    schema: BridgeExecuteSchema,
    handler: handleBridgeExecute,
  });

  console.log('[bridge] Registered tool: amped_oc_bridge_execute');
}

// Export schemas for testing and reuse
export { BridgeDiscoverSchema, BridgeQuoteSchema, BridgeExecuteSchema };

// Export handlers
export { handleBridgeDiscover, handleBridgeQuote, handleBridgeExecute };
