/**
 * Discovery/Read Tools for Amped OpenClaw Plugin
 *
 * These tools provide read-only access to:
 * - Supported chains and tokens
 * - Wallet address resolution
 * - Money market positions and reserves
 *
 * @module tools/discovery
 */

import { Type, Static } from '@sinclair/typebox';
import { getSodaxClient } from '../sodax/client';
import { getSpokeProvider } from '../providers/spokeProviderFactory';
import { getWalletRegistry } from '../wallet/walletRegistry';
import { 
  aggregateCrossChainPositions, 
  formatHealthFactor,
  getHealthFactorStatus,
  getPositionRecommendation 
} from '../utils/positionAggregator';
import { getSodaxApiClient } from '../utils/sodaxApi';

// ============================================================================
// TypeBox Schemas
// ============================================================================

/**
 * Schema for amped_oc_supported_chains - no parameters required
 */
const SupportedChainsSchema = Type.Object({});

/**
 * Schema for amped_oc_supported_tokens
 */
const SupportedTokensSchema = Type.Object({
  module: Type.Union([
    Type.Literal('swaps'),
    Type.Literal('bridge'),
    Type.Literal('moneyMarket'),
  ]),
  chainId: Type.String({
    description: 'Spoke chain ID (e.g., "ethereum", "arbitrum", "sonic")',
  }),
});

/**
 * Schema for amped_oc_wallet_address
 */
const WalletAddressSchema = Type.Object({
  walletId: Type.String({
    description: 'Unique identifier for the wallet',
  }),
});

/**
 * Schema for amped_oc_money_market_positions
 */
const MoneyMarketPositionsSchema = Type.Object({
  walletId: Type.String({
    description: 'Unique identifier for the wallet',
  }),
  chainId: Type.String({
    description: 'Spoke chain ID to query positions on',
  }),
});

/**
 * Schema for amped_oc_money_market_reserves
 */
const MoneyMarketReservesSchema = Type.Object({
  chainId: Type.Optional(
    Type.String({
      description:
        'Optional chain ID. Money market is hub-centric, so this filters results for a specific spoke chain if needed',
    })
  ),
});

/**
 * Schema for amped_oc_cross_chain_positions
 * Get aggregated positions view across all chains
 */
const CrossChainPositionsSchema = Type.Object({
  walletId: Type.String({
    description: 'Unique identifier for the wallet',
  }),
  chainIds: Type.Optional(
    Type.Array(Type.String(), {
      description: 'Optional array of specific chain IDs to query (defaults to all supported chains)',
    })
  ),
  includeZeroBalances: Type.Optional(
    Type.Boolean({
      description: 'Include positions with zero balance',
      default: false,
    })
  ),
  minUsdValue: Type.Optional(
    Type.Number({
      description: 'Minimum USD value threshold for including positions',
      default: 0.01,
    })
  ),
});

/**
 * Schema for amped_oc_user_intents
 * Query user intent history from SODAX API
 */
const UserIntentsSchema = Type.Object({
  walletId: Type.String({
    description: 'Unique identifier for the wallet',
  }),
  status: Type.Optional(
    Type.Union([
      Type.Literal('all', { description: 'All intents (open and closed)' }),
      Type.Literal('open', { description: 'Only open/pending intents' }),
      Type.Literal('closed', { description: 'Only filled/cancelled/expired intents' }),
    ], {
      description: 'Filter by intent status',
      default: 'all',
    })
  ),
  limit: Type.Optional(
    Type.Number({
      description: 'Number of items to return (default: 50, max: 100)',
      default: 50,
      minimum: 1,
      maximum: 100,
    })
  ),
  offset: Type.Optional(
    Type.Number({
      description: 'Number of items to skip (for pagination)',
      default: 0,
      minimum: 0,
    })
  ),
});

// ============================================================================
// Type Definitions
// ============================================================================

type SupportedChainsParams = Static<typeof SupportedChainsSchema>;
type SupportedTokensParams = Static<typeof SupportedTokensSchema>;
type WalletAddressParams = Static<typeof WalletAddressSchema>;
type MoneyMarketPositionsParams = Static<typeof MoneyMarketPositionsSchema>;
type MoneyMarketReservesParams = Static<typeof MoneyMarketReservesSchema>;
type CrossChainPositionsParams = Static<typeof CrossChainPositionsSchema>;
type UserIntentsParams = Static<typeof UserIntentsSchema>;

/**
 * AgentTools interface for registering tools with the OpenClaw framework
 */
interface AgentTools {
  register(tool: {
    name: string;
    summary: string;
    schema: unknown;
    handler: (params: unknown) => Promise<unknown>;
  }): void;
}

// ============================================================================
// Tool Implementations
// ============================================================================

/**
 * Get supported spoke chains from SODAX configuration
 */
async function handleSupportedChains(
  _params: SupportedChainsParams
): Promise<unknown> {
  const sodax = getSodaxClient();
  const chains = sodax.config.getSupportedSpokeChains();

  return {
    success: true,
    chains: chains.map((chain) => ({
      id: chain.id,
      name: chain.name,
      type: chain.type,
      isHub: chain.id === 'sonic',
      nativeCurrency: chain.nativeCurrency,
    })),
  };
}

/**
 * Get supported tokens for a specific module and chain
 */
async function handleSupportedTokens(
  params: SupportedTokensParams
): Promise<unknown> {
  const sodax = getSodaxClient();
  const { module, chainId } = params;

  let tokens: Array<{
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    logoURI?: string;
  }> = [];

  switch (module) {
    case 'swaps': {
      // Get supported swap tokens by chain ID
      const swapTokens = sodax.config.getSupportedSwapTokensByChainId(chainId);
      tokens = swapTokens.map((token) => ({
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        logoURI: token.logoURI,
      }));
      break;
    }

    case 'bridge': {
      // Get bridgeable tokens for the chain
      const bridgeTokens = sodax.bridge.getBridgeableTokens(chainId);
      tokens = bridgeTokens.map((token) => ({
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        logoURI: token.logoURI,
      }));
      break;
    }

    case 'moneyMarket': {
      // Get money market supported tokens from config
      const mmConfig = sodax.config.getMoneyMarketConfig();
      const supportedTokens = mmConfig.supportedTokens?.[chainId] || [];
      tokens = supportedTokens.map((token) => ({
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        logoURI: token.logoURI,
      }));
      break;
    }

    default:
      throw new Error(`Unknown module: ${module}`);
  }

  return {
    success: true,
    module,
    chainId,
    tokens,
    count: tokens.length,
  };
}

/**
 * Get wallet address by walletId
 * In execute mode, validates that the private key matches the address
 */
async function handleWalletAddress(
  params: WalletAddressParams
): Promise<unknown> {
  const { walletId } = params;

  // Get wallet from registry
  const walletRegistry = getWalletRegistry();
  const wallet = walletRegistry.getWallet(walletId);

  return {
    success: true,
    walletId,
    address: wallet.address,
    mode: wallet.mode,
  };
}

/**
 * Get user money market positions (humanized format)
 */
async function handleMoneyMarketPositions(
  params: MoneyMarketPositionsParams
): Promise<unknown> {
  const { walletId, chainId } = params;

  // Get wallet from registry
  const walletRegistry = getWalletRegistry();
  const wallet = walletRegistry.getWallet(walletId);

  // Get spoke provider for this wallet and chain
  const spokeProvider = await getSpokeProvider(wallet.address, chainId);

  const sodax = getSodaxClient();

  // Get user reserves in humanized format
  const userReserves = await sodax.moneyMarket.data.getUserReservesHumanized(
    spokeProvider
  );

  // Format positions for readability
  const positions = userReserves.map((reserve) => ({
    token: {
      address: reserve.token.address,
      symbol: reserve.token.symbol,
      name: reserve.token.name,
      decimals: reserve.token.decimals,
    },
    supply: {
      balance: reserve.supply.balance,
      balanceUsd: reserve.supply.balanceUsd,
      apy: reserve.supply.apy,
      collateral: reserve.supply.isCollateral,
    },
    borrow: {
      balance: reserve.borrow.balance,
      balanceUsd: reserve.borrow.balanceUsd,
      apy: reserve.borrow.apy,
    },
    // Health indicators
    loanToValue: reserve.loanToValue,
    liquidationThreshold: reserve.liquidationThreshold,
  }));

  // Calculate summary metrics
  const totalSupplyUsd = positions.reduce(
    (sum, p) => sum + (parseFloat(p.supply.balanceUsd) || 0),
    0
  );
  const totalBorrowUsd = positions.reduce(
    (sum, p) => sum + (parseFloat(p.borrow.balanceUsd) || 0),
    0
  );
  const netWorthUsd = totalSupplyUsd - totalBorrowUsd;
  const healthFactor =
    totalBorrowUsd > 0 ? totalSupplyUsd / totalBorrowUsd : Infinity;

  return {
    success: true,
    walletId,
    address: wallet.address,
    chainId,
    positions,
    summary: {
      totalSupplyUsd: totalSupplyUsd.toFixed(2),
      totalBorrowUsd: totalBorrowUsd.toFixed(2),
      netWorthUsd: netWorthUsd.toFixed(2),
      healthFactor: healthFactor === Infinity ? '∞' : healthFactor.toFixed(2),
      positionCount: positions.length,
    },
  };
}

/**
 * Get money market reserves (humanized format)
 * Hub-centric: returns reserves across all markets
 */
async function handleMoneyMarketReserves(
  params: MoneyMarketReservesParams
): Promise<unknown> {
  const { chainId } = params;

  const sodax = getSodaxClient();

  // Get reserves in humanized format (hub-centric)
  const reserves = await sodax.moneyMarket.data.getReservesHumanized();

  // Filter by chainId if provided
  let filteredReserves = reserves;
  if (chainId) {
    filteredReserves = reserves.filter(
      (r) => r.token.chainId === chainId || r.hubChainId === chainId
    );
  }

  // Format reserves for readability
  const formattedReserves = filteredReserves.map((reserve) => ({
    token: {
      address: reserve.token.address,
      symbol: reserve.token.symbol,
      name: reserve.token.name,
      decimals: reserve.token.decimals,
      chainId: reserve.token.chainId,
    },
    liquidity: {
      totalSupply: reserve.liquidity.totalSupply,
      availableLiquidity: reserve.liquidity.availableLiquidity,
      totalBorrow: reserve.liquidity.totalBorrow,
      utilizationRate: reserve.liquidity.utilizationRate,
    },
    rates: {
      supplyApy: reserve.rates.supplyApy,
      borrowApy: reserve.rates.borrowApy,
    },
    parameters: {
      loanToValue: reserve.parameters.loanToValue,
      liquidationThreshold: reserve.parameters.liquidationThreshold,
      liquidationBonus: reserve.parameters.liquidationBonus,
    },
    hubChainId: reserve.hubChainId,
  }));

  // Calculate aggregate metrics
  const totalAvailableLiquidity = formattedReserves.reduce(
    (sum, r) => sum + (parseFloat(r.liquidity.availableLiquidity) || 0),
    0
  );
  const totalBorrowed = formattedReserves.reduce(
    (sum, r) => sum + (parseFloat(r.liquidity.totalBorrow) || 0),
    0
  );

  return {
    success: true,
    chainId: chainId || 'all',
    reserves: formattedReserves,
    summary: {
      reserveCount: formattedReserves.length,
      totalAvailableLiquidity: totalAvailableLiquidity.toFixed(2),
      totalBorrowed: totalBorrowed.toFixed(2),
      globalUtilizationRate:
        totalAvailableLiquidity + totalBorrowed > 0
          ? (
              (totalBorrowed / (totalAvailableLiquidity + totalBorrowed)) *
              100
            ).toFixed(2) + '%'
          : '0%',
    },
  };
}

// ============================================================================
// Cross-Chain Positions Tool
// ============================================================================

/**
 * Get aggregated money market positions across all chains
 * 
 * This provides a unified view of:
 * - Total supply/borrow across all networks
 * - Health factor and liquidation risk
 * - Available borrowing power
 * - Net position and APY
 * - Risk metrics and recommendations
 */
async function handleCrossChainPositions(
  params: CrossChainPositionsParams
): Promise<unknown> {
  const { walletId, chainIds, includeZeroBalances, minUsdValue } = params;

  console.log('[discovery:crossChainPositions] Aggregating positions', {
    walletId,
    chainIds: chainIds || 'all',
    includeZeroBalances,
    minUsdValue,
  });

  try {
    const view = await aggregateCrossChainPositions(walletId, {
      chainIds,
      includeZeroBalances,
      minUsdValue,
    });

    // Get recommendations
    const recommendations = getPositionRecommendation(view);

    // Format response
    const response = {
      success: true,
      walletId: view.walletId,
      address: view.address,
      timestamp: view.timestamp,
      summary: {
        totalSupplyUsd: view.summary.totalSupplyUsd.toFixed(2),
        totalBorrowUsd: view.summary.totalBorrowUsd.toFixed(2),
        netWorthUsd: view.summary.netWorthUsd.toFixed(2),
        availableBorrowUsd: view.summary.availableBorrowUsd.toFixed(2),
        healthFactor: formatHealthFactor(view.summary.healthFactor),
        healthFactorStatus: getHealthFactorStatus(view.summary.healthFactor),
        liquidationRisk: view.summary.liquidationRisk,
        weightedSupplyApy: `${(view.summary.weightedSupplyApy * 100).toFixed(2)}%`,
        weightedBorrowApy: `${(view.summary.weightedBorrowApy * 100).toFixed(2)}%`,
        netApy: `${(view.summary.netApy * 100).toFixed(2)}%`,
      },
      chainBreakdown: view.chainSummaries.map(cs => ({
        chainId: cs.chainId,
        supplyUsd: cs.supplyUsd.toFixed(2),
        borrowUsd: cs.borrowUsd.toFixed(2),
        netWorthUsd: cs.netWorthUsd.toFixed(2),
        healthFactor: formatHealthFactor(cs.healthFactor),
        positionCount: cs.positionCount,
      })),
      collateralUtilization: {
        totalCollateralUsd: view.collateralUtilization.totalCollateralUsd.toFixed(2),
        usedCollateralUsd: view.collateralUtilization.usedCollateralUsd.toFixed(2),
        availableCollateralUsd: view.collateralUtilization.availableCollateralUsd.toFixed(2),
        utilizationRate: `${view.collateralUtilization.utilizationRate.toFixed(2)}%`,
      },
      riskMetrics: {
        maxLtv: `${(view.riskMetrics.maxLtv * 100).toFixed(2)}%`,
        currentLtv: `${(view.riskMetrics.currentLtv * 100).toFixed(2)}%`,
        bufferUntilLiquidation: `${view.riskMetrics.bufferUntilLiquidation.toFixed(2)}%`,
        safeMaxBorrowUsd: view.riskMetrics.safeMaxBorrowUsd.toFixed(2),
      },
      positions: view.positions.map(pos => ({
        chainId: pos.chainId,
        token: pos.token,
        supply: {
          balance: pos.supply.balance,
          balanceUsd: pos.supply.balanceUsd,
          apy: `${(pos.supply.apy * 100).toFixed(2)}%`,
          isCollateral: pos.supply.isCollateral,
        },
        borrow: {
          balance: pos.borrow.balance,
          balanceUsd: pos.borrow.balanceUsd,
          apy: `${(pos.borrow.apy * 100).toFixed(2)}%`,
        },
        loanToValue: `${(pos.loanToValue * 100).toFixed(2)}%`,
        liquidationThreshold: `${(pos.liquidationThreshold * 100).toFixed(2)}%`,
      })),
      recommendations,
    };

    console.log('[discovery:crossChainPositions] Aggregation complete', {
      totalPositions: view.positions.length,
      totalSupplyUsd: view.summary.totalSupplyUsd,
      totalBorrowUsd: view.summary.totalBorrowUsd,
      healthFactor: view.summary.healthFactor,
    });

    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[discovery:crossChainPositions] Failed to aggregate positions', {
      error: errorMessage,
      walletId,
    });
    throw new Error(`Failed to aggregate cross-chain positions: ${errorMessage}`);
  }
}

// ============================================================================
// User Intents Tool (SODAX API)
// ============================================================================

/**
 * Get user intents from SODAX API
 * 
 * Queries the backend API for intent history including:
 * - Open/pending intents
 * - Filled intents
 * - Cancelled/expired intents
 * - Event history for each intent
 */
async function handleUserIntents(
  params: UserIntentsParams
): Promise<unknown> {
  const { walletId, status = 'all', limit = 50, offset = 0 } = params;

  console.log('[discovery:userIntents] Fetching user intents', {
    walletId,
    status,
    limit,
    offset,
  });

  try {
    // Get wallet address
    const walletRegistry = getWalletRegistry();
    const wallet = await walletRegistry.resolveWallet(walletId);

    if (!wallet) {
      throw new Error(`Wallet not found: ${walletId}`);
    }

    // Initialize API client
    const apiClient = getSodaxApiClient();

    // Determine filters based on status
    let filters;
    if (status === 'open') {
      filters = { open: true };
    } else if (status === 'closed') {
      filters = { open: false };
    }

    // Fetch intents
    const response = await apiClient.getUserIntents(
      wallet.address,
      { limit, offset },
      filters
    );

    // Format response
    const formattedIntents = response.items.map(intent => ({
      intentHash: intent.intentHash,
      txHash: intent.txHash,
      chainId: intent.chainId,
      blockNumber: intent.blockNumber,
      status: intent.open ? 'open' : 'closed',
      createdAt: intent.createdAt,
      input: {
        token: intent.intent.inputToken,
        amount: intent.intent.inputAmount,
        chainId: intent.intent.srcChain,
      },
      output: {
        token: intent.intent.outputToken,
        minAmount: intent.intent.minOutputAmount,
        chainId: intent.intent.dstChain,
      },
      deadline: new Date(parseInt(intent.intent.deadline) * 1000).toISOString(),
      allowPartialFill: intent.intent.allowPartialFill,
      events: intent.events.map(event => ({
        type: event.eventType,
        txHash: event.txHash,
        blockNumber: event.blockNumber,
        state: {
          remainingInput: event.intentState.remainingInput,
          receivedOutput: event.intentState.receivedOutput,
          pendingPayment: event.intentState.pendingPayment,
        },
      })),
    }));

    const result = {
      success: true,
      walletId,
      address: wallet.address,
      pagination: {
        total: response.total,
        offset: response.offset,
        limit: response.limit,
        hasMore: response.offset + response.items.length < response.total,
      },
      intents: formattedIntents,
      summary: {
        totalIntents: response.total,
        returned: formattedIntents.length,
        openIntents: formattedIntents.filter((i: { status: string }) => i.status === 'open').length,
        closedIntents: formattedIntents.filter((i: { status: string }) => i.status === 'closed').length,
      },
    };

    console.log('[discovery:userIntents] User intents fetched', {
      total: response.total,
      returned: formattedIntents.length,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[discovery:userIntents] Failed to fetch user intents', {
      error: errorMessage,
      walletId,
    });
    throw new Error(`Failed to fetch user intents: ${errorMessage}`);
  }
}

// ============================================================================
// Tool Registration
// ============================================================================

/**
 * Register all discovery tools with the agent tools registry
 *
 * @param agentTools - The OpenClaw AgentTools instance
 */
export function registerDiscoveryTools(agentTools: AgentTools): void {
  // 1. amped_oc_supported_chains - Get supported spoke chains
  agentTools.register({
    name: 'amped_oc_supported_chains',
    summary:
      'Get a list of all supported spoke chains for swaps, bridging, and money market operations',
    schema: SupportedChainsSchema,
    handler: handleSupportedChains,
  });

  // 2. amped_oc_supported_tokens - Get supported tokens by module
  agentTools.register({
    name: 'amped_oc_supported_tokens',
    summary:
      'Get supported tokens for a specific module (swaps, bridge, or moneyMarket) on a given chain',
    schema: SupportedTokensSchema,
    handler: handleSupportedTokens,
  });

  // 3. amped_oc_wallet_address - Get wallet address
  agentTools.register({
    name: 'amped_oc_wallet_address',
    summary:
      'Get the resolved wallet address for a given walletId. Validates private key matches in execute mode.',
    schema: WalletAddressSchema,
    handler: handleWalletAddress,
  });

  // 4. amped_oc_money_market_positions - Get user positions (humanized)
  agentTools.register({
    name: 'amped_oc_money_market_positions',
    summary:
      'Get humanized money market positions for a wallet on a specific chain, including supply/borrow balances and health metrics',
    schema: MoneyMarketPositionsSchema,
    handler: handleMoneyMarketPositions,
  });

  // 5. amped_oc_money_market_reserves - Get market reserves (humanized)
  agentTools.register({
    name: 'amped_oc_money_market_reserves',
    summary:
      'Get humanized money market reserves data including liquidity, rates, and parameters. Hub-centric with optional chain filtering.',
    schema: MoneyMarketReservesSchema,
    handler: handleMoneyMarketReserves,
  });

  // 6. amped_oc_cross_chain_positions - Get aggregated positions across all chains
  agentTools.register({
    name: 'amped_oc_cross_chain_positions',
    summary:
      'Get a unified view of money market positions across ALL chains. Shows total supply/borrow, health factor, borrowing power, net APY, and risk metrics.',
    description:
      'Aggregates money market positions across all supported chains to provide a comprehensive portfolio view. ' +
      'Includes: total supply/borrow in USD, health factor with risk status, available borrowing power, ' +
      'weighted APYs, collateral utilization, and personalized recommendations. ' +
      'This is the recommended tool for getting a complete picture of money market positions.',
    schema: CrossChainPositionsSchema,
    handler: handleCrossChainPositions,
  });

  // 7. amped_oc_user_intents - Query user intent history from SODAX API
  agentTools.register({
    name: 'amped_oc_user_intents',
    summary:
      'Query user swap intent history from SODAX backend API. Shows open, filled, and cancelled intents with event details.',
    description:
      'Retrieves the complete intent history for a wallet from the SODAX backend API. ' +
      'Includes open intents (pending), filled intents (completed), and cancelled/expired intents. ' +
      'Each intent includes input/output tokens, amounts, chain IDs, and event history. ' +
      'Use this to track the status of past swaps and bridge operations.',
    schema: UserIntentsSchema,
    handler: handleUserIntents,
  });
}

// Export schemas for testing and reuse
export {
  SupportedChainsSchema,
  SupportedTokensSchema,
  WalletAddressSchema,
  MoneyMarketPositionsSchema,
  MoneyMarketReservesSchema,
  CrossChainPositionsSchema,
  UserIntentsSchema,
};

// Export handlers for testing
export {
  handleSupportedChains,
  handleSupportedTokens,
  handleWalletAddress,
  handleMoneyMarketPositions,
  handleMoneyMarketReserves,
  handleCrossChainPositions,
  handleMoneyMarketPositions,
  handleMoneyMarketReserves,
};
