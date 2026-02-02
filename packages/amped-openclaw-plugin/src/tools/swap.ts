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
import { sodax, QuoteRequest, Intent, SwapQuote, IntentStatus } from '@sodax/sdk';
import { getSodaxClient } from '../sodax/client';
import { getSpokeProviderFactory } from '../providers/spokeProviderFactory';
import { PolicyEngine } from '../policy/policyEngine';
import { getWalletRegistry } from '../wallet/walletRegistry';
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

const SwapQuoteResultSchema = Type.Object({
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
    
    const quoteRequest: QuoteRequest = {
      walletId: params.walletId,
      srcChainId: params.srcChainId,
      dstChainId: params.dstChainId,
      srcToken: params.srcToken,
      dstToken: params.dstToken,
      amount: params.amount,
      type: params.type,
      slippageBps: params.slippageBps
    };

    const quote = await sodaxClient.swaps.getQuote(quoteRequest);
    
    // Normalize and return quote
    const result = {
      inputAmount: quote.inputAmount,
      outputAmount: quote.outputAmount,
      srcToken: quote.srcToken,
      dstToken: quote.dstToken,
      srcChainId: quote.srcChainId,
      dstChainId: quote.dstChainId,
      slippageBps: params.slippageBps,
      deadline: quote.deadline || calculateDeadline(300), // 5 min default
      fees: {
        solverFee: quote.fees?.solverFee || '0',
        protocolFee: quote.fees?.protocolFee,
        partnerFee: quote.fees?.partnerFee
      },
      minOutputAmount: quote.minOutputAmount,
      maxInputAmount: quote.maxInputAmount
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
    const walletRegistry = new WalletRegistry();
    const spokeProviderFactory = getSpokeProviderFactory();
    const sodaxClient = getSodaxClient();
    
    // 2. Resolve wallet
    const wallet = await walletRegistry.getWallet(params.walletId);
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
    const spokeProvider = await spokeProviderFactory.getProvider(
      params.walletId,
      params.quote.srcChainId
    );
    
    // 5. Check allowance
    const isAllowanceValid = await sodaxClient.swaps.isAllowanceValid({
      spokeProvider,
      token: params.quote.srcToken,
      amount: params.quote.inputAmount
    });
    
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
      
      const approvalTx = await sodaxClient.swaps.approve({
        spokeProvider,
        token: params.quote.srcToken,
        amount: params.quote.inputAmount
      });
      
      // Wait for approval confirmation
      await spokeProvider.waitForTransaction(approvalTx);
      
      logStructured({
        requestId,
        opType: 'swap_approve',
        walletId: params.walletId,
        chainId: params.quote.srcChainId,
        token: params.quote.srcToken,
        approvalTx,
        success: true
      });
    }
    
    // 7. Execute swap
    const swapResult = await sodaxClient.swaps.swap({
      spokeProvider,
      quote: {
        srcChainId: params.quote.srcChainId,
        dstChainId: params.quote.dstChainId,
        srcToken: params.quote.srcToken,
        dstToken: params.quote.dstToken,
        inputAmount: params.quote.inputAmount,
        outputAmount: params.quote.outputAmount,
        slippageBps: params.quote.slippageBps,
        deadline: params.quote.deadline,
        minOutputAmount: params.quote.minOutputAmount,
        maxInputAmount: params.quote.maxInputAmount
      },
      skipSimulation: params.skipSimulation || false,
      timeoutMs: params.timeoutMs || 120000
    });
    
    const result = {
      spokeTxHash: swapResult.spokeTxHash,
      hubTxHash: swapResult.hubTxHash,
      intentHash: swapResult.intentHash,
      status: swapResult.status || 'pending',
      message: 'Swap executed successfully'
    };
    
    logStructured({
      requestId,
      opType: 'swap_execute',
      walletId: params.walletId,
      chainIds: [params.quote.srcChainId, params.quote.dstChainId],
      tokenAddresses: [params.quote.srcToken, params.quote.dstToken],
      spokeTxHash: swapResult.spokeTxHash,
      hubTxHash: swapResult.hubTxHash,
      intentHash: swapResult.intentHash,
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
        status = await sodaxClient.swaps.getStatus({ intentHash: params.intentHash });
        intent = await sodaxClient.swaps.getIntent({ intentHash: params.intentHash });
      } catch {
        // Intent hash lookup failed, will try txHash
      }
    }
    
    // Fallback to txHash
    if (!status && params.txHash) {
      status = await sodaxClient.swaps.getStatus({ txHash: params.txHash });
    }
    
    if (!status) {
      throw new Error('Unable to retrieve swap status');
    }
    
    const result: Record<string, unknown> = {
      status: status.status,
      intentHash: params.intentHash || status.intentHash,
      spokeTxHash: params.txHash || status.spokeTxHash,
      hubTxHash: status.hubTxHash,
      filledAmount: status.filledAmount,
      error: status.error,
      createdAt: intent?.createdAt,
      expiresAt: intent?.deadline
    };
    
    logStructured({
      requestId,
      opType: 'swap_status',
      intentHash: params.intentHash,
      txHash: params.txHash,
      status: status.status,
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
    const walletRegistry = new WalletRegistry();
    const spokeProviderFactory = getSpokeProviderFactory();
    const sodaxClient = getSodaxClient();
    
    // Resolve wallet
    const wallet = await walletRegistry.getWallet(params.walletId);
    if (!wallet) {
      throw new Error(`Wallet not found: ${params.walletId}`);
    }
    
    // Get spoke provider for source chain
    const spokeProvider = await spokeProviderFactory.getProvider(
      params.walletId,
      params.srcChainId
    );
    
    // Construct intent object for cancellation
    const intent: Intent = {
      id: params.intent.id,
      srcChainId: params.intent.srcChainId,
      dstChainId: params.intent.dstChainId,
      srcToken: params.intent.srcToken,
      dstToken: params.intent.dstToken,
      amount: params.intent.amount,
      deadline: params.intent.deadline,
      createdAt: Date.now(), // Approximate if not provided
      status: 'pending'
    };
    
    // Cancel the intent
    const cancelTx = await sodaxClient.swaps.cancelIntent({
      intent,
      spokeProvider
    });
    
    // Wait for cancellation confirmation
    await spokeProvider.waitForTransaction(cancelTx);
    
    const result = {
      success: true,
      txHash: cancelTx,
      message: 'Intent cancelled successfully'
    };
    
    logStructured({
      requestId,
      opType: 'swap_cancel',
      walletId: params.walletId,
      chainId: params.srcChainId,
      intentId: params.intent.id,
      txHash: cancelTx,
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
