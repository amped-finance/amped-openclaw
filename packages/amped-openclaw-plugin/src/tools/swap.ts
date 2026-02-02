/**
 * Swap Tools for Amped OpenClaw Plugin
 * 
 * Provides OpenClaw tools for cross-chain swap operations using SODAX SDK:
 * - amped_oc_swap_quote: Get exact-in/exact-out quotes
 * - amped_oc_swap_execute: Execute swaps with policy enforcement
 * - amped_oc_swap_status: Poll intent status
 * - amped_oc_swap_cancel: Cancel active intents
 */

import { Static, Type } from '@sinclair/typebox';
// SDK types - using any for now due to beta API changes
import { Intent } from '@sodax/sdk';
type QuoteRequest = any;
type SwapQuote = any;
type IntentStatus = any;
import { getSodaxClient } from '../sodax/client';
import { getSpokeProvider } from '../providers/spokeProviderFactory';
import { PolicyEngine } from '../policy/policyEngine';
import { getWalletRegistry, WalletRegistry } from '../wallet/walletRegistry';
import type { AgentTools } from '../types';

// ============================================================================
// TypeBox Schemas
// ============================================================================

const SwapTypeSchema = Type.Union([
  Type.Literal('exact_input'),
  Type.Literal('exact_output')
]);

const SwapQuoteRequestSchema = Type.Object({
  walletId: Type.String(),
  srcChainId: Type.String(),
  dstChainId: Type.String(),
  srcToken: Type.String(),
  dstToken: Type.String(),
  amount: Type.String(),
  type: SwapTypeSchema,
  slippageBps: Type.Number({ default: 50, minimum: 0, maximum: 10000 })
});

// Result schema for documentation (not used at runtime)
const _SwapQuoteResultSchema = Type.Object({
  inputAmount: Type.String(),
  outputAmount: Type.String(),
  srcToken: Type.String(),
  dstToken: Type.String(),
  srcChainId: Type.String(),
  dstChainId: Type.String(),
  slippageBps: Type.Number(),
  deadline: Type.Number(),
  fees: Type.Object({
    solverFee: Type.String(),
    protocolFee: Type.Optional(Type.String()),
    partnerFee: Type.Optional(Type.String())
  }),
  minOutputAmount: Type.Optional(Type.String()),
  maxInputAmount: Type.Optional(Type.String())
});
void _SwapQuoteResultSchema; // Suppress unused warning

const SwapExecuteParamsSchema = Type.Object({
  walletId: Type.String(),
  quote: Type.Object({
    srcChainId: Type.String(),
    dstChainId: Type.String(),
    srcToken: Type.String(),
    dstToken: Type.String(),
    inputAmount: Type.String(),
    outputAmount: Type.String(),
    slippageBps: Type.Number(),
    deadline: Type.Number(),
    minOutputAmount: Type.Optional(Type.String()),
    maxInputAmount: Type.Optional(Type.String())
  }),
  maxSlippageBps: Type.Optional(Type.Number({ minimum: 0, maximum: 10000 })),
  policyId: Type.Optional(Type.String()),
  skipSimulation: Type.Optional(Type.Boolean({ default: false })),
  timeoutMs: Type.Optional(Type.Number({ default: 120000 }))
});

const SwapExecuteResultSchema = Type.Object({
  spokeTxHash: Type.String(),
  hubTxHash: Type.Optional(Type.String()),
  intentHash: Type.Optional(Type.String()),
  status: Type.String(),
  message: Type.Optional(Type.String())
});

const SwapStatusParamsSchema = Type.Object({
  txHash: Type.Optional(Type.String()),
  intentHash: Type.Optional(Type.String())
});

const SwapStatusResultSchema = Type.Object({
  status: Type.String(),
  intentHash: Type.Optional(Type.String()),
  spokeTxHash: Type.Optional(Type.String()),
  hubTxHash: Type.Optional(Type.String()),
  filledAmount: Type.Optional(Type.String()),
  error: Type.Optional(Type.String()),
  createdAt: Type.Optional(Type.Number()),
  expiresAt: Type.Optional(Type.Number())
});

const SwapCancelParamsSchema = Type.Object({
  walletId: Type.String(),
  intent: Type.Object({
    id: Type.String(),
    srcChainId: Type.String(),
    dstChainId: Type.String(),
    srcToken: Type.String(),
    dstToken: Type.String(),
    amount: Type.String(),
    deadline: Type.Number()
  }),
  srcChainId: Type.String()
});

const SwapCancelResultSchema = Type.Object({
  success: Type.Boolean(),
  txHash: Type.Optional(Type.String()),
  message: Type.String()
});

// ============================================================================
// Type Definitions
// ============================================================================

type SwapQuoteRequest = Static<typeof SwapQuoteRequestSchema>;
type SwapExecuteParams = Static<typeof SwapExecuteParamsSchema>;
type SwapStatusParams = Static<typeof SwapStatusParamsSchema>;
type SwapCancelParams = Static<typeof SwapCancelParamsSchema>;

// ============================================================================
// Swap Quote Tool
// ============================================================================

async function handleSwapQuote(params: SwapQuoteRequest): Promise<Record<string, unknown>> {
  const requestId = generateRequestId();
  const startTime = Date.now();
  
  try {
    const sodaxClient = getSodaxClient();
    
    // Get token config to determine decimals for amount conversion
    const configService = (sodaxClient as any).configService;
    const tokenConfig = configService?.getTokenConfig?.(params.srcChainId, params.srcToken);
    const decimals = tokenConfig?.decimals ?? 6; // Default to 6 (USDC) if not found
    
    // Convert human-readable amount to raw amount (bigint)
    const amountFloat = parseFloat(params.amount);
    const rawAmount = BigInt(Math.floor(amountFloat * Math.pow(10, decimals)));
    
    // Build SDK-compatible request with snake_case parameters
    const quoteRequest = {
      token_src: params.srcToken,
      token_src_blockchain_id: params.srcChainId,
      token_dst: params.dstToken,
      token_dst_blockchain_id: params.dstChainId,
      amount: rawAmount,
      quote_type: params.type
    };
    
    console.log('[swap_quote] SDK request:', JSON.stringify(quoteRequest, (k, v) => typeof v === 'bigint' ? v.toString() : v));

    const quoteResult = await (sodaxClient as any).swaps.getQuote(quoteRequest);
    
    // Handle Result type from SDK
    if (quoteResult.ok === false) {
      throw new Error(`Quote failed: ${quoteResult.error}`);
    }
    
    const quote = quoteResult.ok ? quoteResult.value : quoteResult;
    
    console.log('[swap_quote] SDK response:', JSON.stringify(quote, (k, v) => typeof v === 'bigint' ? v.toString() : v));
    
    // Get token config for output decimal conversion
    const dstTokenConfig = (sodaxClient as any).configService?.getTokenConfig?.(params.dstChainId, params.dstToken);
    const dstDecimals = dstTokenConfig?.decimals ?? 6;
    
    // SDK returns quoted_amount as bigint - convert to human-readable string
    const quotedAmount = quote.quoted_amount || quote.quotedAmount || quote.outputAmount;
    const outputAmountStr = quotedAmount 
      ? (Number(quotedAmount) / Math.pow(10, dstDecimals)).toString()
      : '0';
    
    // Normalize and return quote (SDK uses snake_case, we return camelCase)
    const result = {
      inputAmount: params.amount,
      outputAmount: outputAmountStr,
      srcToken: params.srcToken,
      dstToken: params.dstToken,
      srcChainId: params.srcChainId,
      dstChainId: params.dstChainId,
      slippageBps: params.slippageBps,
      deadline: quote.deadline || calculateDeadline(300), // 5 min default
      fees: {
        solverFee: quote.solver_fee || quote.fees?.solverFee || '0',
        protocolFee: quote.protocol_fee || quote.fees?.protocolFee,
        partnerFee: quote.partner_fee || quote.fees?.partnerFee
      },
      minOutputAmount: quote.min_output_amount || quote.minOutputAmount,
      maxInputAmount: quote.max_input_amount || quote.maxInputAmount,
      // Include raw SDK response for debugging
      _raw: JSON.parse(JSON.stringify(quote, (k, v) => typeof v === 'bigint' ? v.toString() : v))
    };
    
    logStructured({
      requestId,
      opType: 'swap_quote',
      walletId: params.walletId,
      chainIds: [params.srcChainId, params.dstChainId],
      tokenAddresses: [params.srcToken, params.dstToken],
      durationMs: Date.now() - startTime,
      success: true
    });
    
    return result;
  } catch (error) {
    logStructured({
      requestId,
      opType: 'swap_quote',
      walletId: params.walletId,
      chainIds: [params.srcChainId, params.dstChainId],
      durationMs: Date.now() - startTime,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
    
    throw new Error(`Failed to get swap quote: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// Swap Execute Tool
// ============================================================================

async function handleSwapExecute(params: SwapExecuteParams): Promise<Record<string, unknown>> {
  const requestId = generateRequestId();
  const startTime = Date.now();
  
  try {
    // 1. Initialize dependencies
    const policyEngine = new PolicyEngine();
    const walletRegistry = getWalletRegistry();
    const sodaxClient = getSodaxClient();
    
    // 2. Resolve wallet
    const wallet = await walletRegistry.resolveWallet(params.walletId);
    if (!wallet) {
      throw new Error(`Wallet not found: ${params.walletId}`);
    }
    
    // 3. Policy check
    const policyCheck = await policyEngine.checkSwap({
      walletId: params.walletId,
      srcChainId: params.quote.srcChainId,
      dstChainId: params.quote.dstChainId,
      srcToken: params.quote.srcToken,
      dstToken: params.quote.dstToken,
      inputAmount: params.quote.inputAmount,
      slippageBps: params.maxSlippageBps || params.quote.slippageBps,
      policyId: params.policyId
    });
    
    if (!policyCheck.allowed) {
      throw new Error(`Policy check failed: ${policyCheck.reason}`);
    }
    
    // 4. Get spoke provider for source chain
    const spokeProvider = await getSpokeProvider(
      params.walletId,
      params.quote.srcChainId
    );
    
    // 5. Check allowance
    let isAllowanceValid = false;
    try {
      const allowanceResult = await (sodaxClient as any).swaps.isAllowanceValid({
        spokeProvider,
        token: params.quote.srcToken,
        amount: params.quote.inputAmount
      });
      isAllowanceValid = allowanceResult?.ok ? allowanceResult.value : !!allowanceResult;
    } catch {
      isAllowanceValid = false;
    }
    
    // 6. Approve if needed
    if (!isAllowanceValid) {
      logStructured({
        requestId,
        opType: 'swap_approve',
        walletId: params.walletId,
        chainId: params.quote.srcChainId,
        token: params.quote.srcToken,
        message: 'Token approval required'
      });
      
      const approvalResult = await (sodaxClient as any).swaps.approve({
        spokeProvider,
        token: params.quote.srcToken,
        amount: params.quote.inputAmount
      });
      
      const approvalTx = approvalResult?.ok ? approvalResult.value : approvalResult;
      
      // Wait for approval confirmation if possible
      // SDK may expose waitForTransactionReceipt on the underlying wallet provider
      if ((spokeProvider as any).walletProvider?.waitForTransactionReceipt) {
        await (spokeProvider as any).walletProvider.waitForTransactionReceipt(approvalTx);
      }
      
      logStructured({
        requestId,
        opType: 'swap_approve',
        walletId: params.walletId,
        chainId: params.quote.srcChainId,
        token: params.quote.srcToken,
        approvalTx: String(approvalTx),
        success: true
      });
    }
    
    // 7. Execute swap
    const swapResult = await (sodaxClient as any).swaps.swap({
      intentParams: {
        srcChainId: params.quote.srcChainId,
        dstChainId: params.quote.dstChainId,
        srcToken: params.quote.srcToken,
        dstToken: params.quote.dstToken,
        inputAmount: params.quote.inputAmount,
        outputAmount: params.quote.outputAmount,
        slippageBps: params.quote.slippageBps,
        deadline: BigInt(params.quote.deadline),
        minOutputAmount: params.quote.minOutputAmount,
        maxInputAmount: params.quote.maxInputAmount
      },
      spokeProvider,
      skipSimulation: params.skipSimulation || false,
      timeout: params.timeoutMs || 120000
    });
    
    // Handle Result type from SDK
    if (swapResult.ok === false) {
      throw new Error(`Swap failed: ${swapResult.error}`);
    }
    
    const value = swapResult.ok ? swapResult.value : swapResult;
    
    // SDK may return [response, intent, deliveryInfo] tuple
    const [response, intent] = Array.isArray(value) ? value : [value, undefined];
    
    const result = {
      spokeTxHash: response?.spokeTxHash || response?.txHash || String(response),
      hubTxHash: response?.hubTxHash,
      intentHash: intent?.intentHash || response?.intentHash,
      status: response?.status || 'pending',
      message: 'Swap executed successfully'
    };
    
    logStructured({
      requestId,
      opType: 'swap_execute',
      walletId: params.walletId,
      chainIds: [params.quote.srcChainId, params.quote.dstChainId],
      tokenAddresses: [params.quote.srcToken, params.quote.dstToken],
      spokeTxHash: result.spokeTxHash,
      hubTxHash: result.hubTxHash,
      intentHash: result.intentHash,
      durationMs: Date.now() - startTime,
      success: true
    });
    
    return result;
  } catch (error) {
    logStructured({
      requestId,
      opType: 'swap_execute',
      walletId: params.walletId,
      chainIds: [params.quote.srcChainId, params.quote.dstChainId],
      durationMs: Date.now() - startTime,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
    
    throw new Error(`Swap execution failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// Swap Status Tool
// ============================================================================

async function handleSwapStatus(params: SwapStatusParams): Promise<Record<string, unknown>> {
  const requestId = generateRequestId();
  const startTime = Date.now();
  
  try {
    if (!params.txHash && !params.intentHash) {
      throw new Error('Either txHash or intentHash must be provided');
    }
    
    const sodaxClient = getSodaxClient();
    
    let status: IntentStatus | null = null;
    let intent: Intent | null = null;
    
    // Try to get status by intent hash first (more reliable)
    if (params.intentHash) {
      try {
        const statusResult = await (sodaxClient as any).swaps.getStatus(params.intentHash as `0x${string}`);
        status = statusResult?.ok ? statusResult.value : statusResult;
        
        const intentResult = await (sodaxClient as any).swaps.getIntent(params.intentHash as `0x${string}`);
        intent = intentResult?.ok ? intentResult.value : intentResult;
      } catch {
        // Intent hash lookup failed, will try txHash
      }
    }
    
    // Fallback to txHash
    if (!status && params.txHash) {
      const statusResult = await (sodaxClient as any).swaps.getStatus(params.txHash as `0x${string}`);
      status = statusResult?.ok ? statusResult.value : statusResult;
    }
    
    if (!status) {
      throw new Error('Unable to retrieve swap status');
    }
    
    const result: Record<string, unknown> = {
      status: (status as any).status || status,
      intentHash: params.intentHash || (status as any).intentHash,
      spokeTxHash: params.txHash || (status as any).spokeTxHash,
      hubTxHash: (status as any).hubTxHash,
      filledAmount: (status as any).filledAmount,
      error: (status as any).error,
      createdAt: (intent as any)?.createdAt,
      expiresAt: (intent as any)?.deadline
    };
    
    logStructured({
      requestId,
      opType: 'swap_status',
      intentHash: params.intentHash,
      txHash: params.txHash,
      status: String((status as any).status || status),
      durationMs: Date.now() - startTime,
      success: true
    });
    
    return result;
  } catch (error) {
    logStructured({
      requestId,
      opType: 'swap_status',
      intentHash: params.intentHash,
      txHash: params.txHash,
      durationMs: Date.now() - startTime,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
    
    throw new Error(`Failed to get swap status: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// Swap Cancel Tool
// ============================================================================

async function handleSwapCancel(params: SwapCancelParams): Promise<Record<string, unknown>> {
  const requestId = generateRequestId();
  const startTime = Date.now();
  
  try {
    const walletRegistry = getWalletRegistry();
    const sodaxClient = getSodaxClient();
    
    // Resolve wallet
    const wallet = await walletRegistry.resolveWallet(params.walletId);
    if (!wallet) {
      throw new Error(`Wallet not found: ${params.walletId}`);
    }
    
    // Get spoke provider for source chain
    const spokeProvider = await getSpokeProvider(
      params.walletId,
      params.srcChainId
    );
    
    // Construct intent object for cancellation
    const intent = {
      id: params.intent.id,
      srcChainId: params.intent.srcChainId,
      dstChainId: params.intent.dstChainId,
      srcToken: params.intent.srcToken,
      dstToken: params.intent.dstToken,
      amount: params.intent.amount,
      deadline: BigInt(params.intent.deadline),
      createdAt: Date.now(),
      status: 'pending'
    } as unknown as Intent;
    
    // Cancel the intent - SDK expects (intent, spokeProvider)
    const cancelResult = await (sodaxClient as any).swaps.cancelIntent(intent, spokeProvider);
    
    // Handle Result type
    if (cancelResult.ok === false) {
      throw new Error(`Cancel failed: ${cancelResult.error}`);
    }
    
    const cancelTx = cancelResult.ok ? cancelResult.value : cancelResult;
    const cancelTxHash = typeof cancelTx === 'string' ? cancelTx : String(cancelTx);
    
    // Wait for cancellation confirmation if possible
    // SDK may expose waitForTransactionReceipt on the underlying wallet provider
    if ((spokeProvider as any).walletProvider?.waitForTransactionReceipt) {
      await (spokeProvider as any).walletProvider.waitForTransactionReceipt(cancelTxHash);
    }
    
    const result = {
      success: true,
      txHash: cancelTxHash,
      message: 'Intent cancelled successfully'
    };
    
    logStructured({
      requestId,
      opType: 'swap_cancel',
      walletId: params.walletId,
      chainId: params.srcChainId,
      intentId: params.intent.id,
      txHash: cancelTxHash,
      durationMs: Date.now() - startTime,
      success: true
    });
    
    return result;
  } catch (error) {
    logStructured({
      requestId,
      opType: 'swap_cancel',
      walletId: params.walletId,
      chainId: params.srcChainId,
      intentId: params.intent.id,
      durationMs: Date.now() - startTime,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
    
    throw new Error(`Failed to cancel swap: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function calculateDeadline(secondsFromNow: number): number {
  return Math.floor(Date.now() / 1000) + secondsFromNow;
}

interface LogEntry {
  requestId: string;
  opType: string;
  walletId?: string;
  chainId?: string;
  chainIds?: string[];
  token?: string;
  tokenAddresses?: string[];
  intentHash?: string;
  txHash?: string;
  spokeTxHash?: string;
  hubTxHash?: string;
  approvalTx?: string;
  status?: string;
  durationMs?: number;
  success?: boolean;
  error?: string;
  message?: string;
  intentId?: string;
}

function logStructured(entry: LogEntry): void {
  // Structured JSON logging for observability
  console.log(JSON.stringify({
    ...entry,
    timestamp: new Date().toISOString(),
    component: 'amped-openclaw-swap'
  }));
}

// ============================================================================
// Tool Registration
// ============================================================================

export function registerSwapTools(agentTools: AgentTools): void {
  // Register swap quote tool
  agentTools.register({
    name: 'amped_oc_swap_quote',
    summary: 'Get a swap quote for exact-in or exact-out swaps across chains',
    description: 'Retrieves a quote for swapping tokens across chains using the SODAX swap protocol. ' +
      'Supports both exact input (specify input amount, get output estimate) and ' +
      'exact output (specify desired output, get required input) modes.',
    schema: SwapQuoteRequestSchema,
    handler: handleSwapQuote
  });
  
  // Register swap execute tool
  agentTools.register({
    name: 'amped_oc_swap_execute',
    summary: 'Execute a swap with policy enforcement and allowance handling',
    description: 'Executes a swap using a previously obtained quote. ' +
      'Performs policy checks, validates allowances, approves tokens if needed, ' +
      'and executes the swap transaction. Returns transaction hashes and intent status.',
    schema: SwapExecuteParamsSchema,
    handler: handleSwapExecute
  });
  
  // Register swap status tool
  agentTools.register({
    name: 'amped_oc_swap_status',
    summary: 'Check the status of a swap intent or transaction',
    description: 'Polls the status of a swap by intent hash or transaction hash. ' +
      'Returns current status, fill amount, error details if failed, and timing information.',
    schema: SwapStatusParamsSchema,
    handler: handleSwapStatus
  });
  
  // Register swap cancel tool
  agentTools.register({
    name: 'amped_oc_swap_cancel',
    summary: 'Cancel an active swap intent',
    description: 'Cancels a pending swap intent on the source chain. ' +
      'Requires the intent details and source chain ID. Returns cancellation transaction hash.',
    schema: SwapCancelParamsSchema,
    handler: handleSwapCancel
  });
}

// Silence unused variable warnings for result schemas (used for documentation)
void SwapExecuteResultSchema;
void SwapStatusResultSchema;
void SwapCancelResultSchema;

// Export schemas with consistent naming
export {
  SwapQuoteRequestSchema as SwapQuoteSchema,
  SwapExecuteParamsSchema as SwapExecuteSchema,
  SwapStatusParamsSchema as SwapStatusSchema,
  SwapCancelParamsSchema as SwapCancelSchema,
};

// Export handlers
export {
  handleSwapQuote,
  handleSwapExecute,
  handleSwapStatus,
  handleSwapCancel,
};
