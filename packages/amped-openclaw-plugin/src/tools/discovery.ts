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
import { getWalletManager, type IWalletBackend, type WalletInfo } from '../wallet';
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

/**
 * Schema for amped_oc_list_wallets - List all configured wallets
 */
const ListWalletsSchema = Type.Object({});

// ============================================================================
// Type Definitions
// ============================================================================

type SupportedChainsParams = Static<typeof SupportedChainsSchema>;
type SupportedTokensParams = Static<typeof SupportedTokensSchema>;
type WalletAddressParams = Static<typeof WalletAddressSchema>;
type MoneyMarketPositionsParams = Static<typeof MoneyMarketPositionsSchema>;
type ListWalletsParams = Static<typeof ListWalletsSchema>;
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
    description?: string;
    schema: unknown;
    handler: (params: unknown) => Promise<unknown>;
  }): void;
}

// Helper to wrap typed handlers for AgentTools registration
function wrapHandler<T>(handler: (params: T) => Promise<unknown>): (params: unknown) => Promise<unknown> {
  return (params: unknown) => handler(params as T);
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

  // SDK may return chain IDs as strings or chain objects
  return {
    success: true,
    chains: chains.map((chain: any) => {
      // Handle both string IDs and chain objects
      if (typeof chain === 'string') {
        return {
          id: chain,
          name: chain,
          type: 'evm',
          isHub: chain === 'sonic',
          nativeCurrency: undefined,
        };
      }
      return {
        id: chain.id || chain,
        name: chain.name || chain.id || chain,
        type: chain.type || 'evm',
        isHub: (chain.id || chain) === 'sonic',
        nativeCurrency: chain.nativeCurrency,
      };
    }),
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

  // Helper to normalize token data
  const normalizeToken = (token: any) => ({
    address: token.address || '',
    symbol: token.symbol || '',
    name: token.name || token.symbol || '',
    decimals: token.decimals || 18,
    logoURI: token.logoURI || token.logoUri,
  });

  switch (module) {
    case 'swaps': {
      // Get supported swap tokens by chain ID
      // SDK may require chainId to be cast to specific type
      try {
        const swapTokens = sodax.config.getSupportedSwapTokensByChainId(chainId as any);
        tokens = (swapTokens || []).map(normalizeToken);
      } catch (e) {
        console.warn('[discovery] Failed to get swap tokens:', e);
        tokens = [];
      }
      break;
    }

    case 'bridge': {
      // Get bridgeable tokens for the chain
      // Note: getBridgeableTokens requires 3 args - we'll get all tokens for a chain
      try {
        // Try to get config-based token list instead
        const configTokens = (sodax.config as any).getBridgeTokensByChainId?.(chainId) || [];
        tokens = configTokens.map(normalizeToken);
      } catch (e) {
        console.warn('[discovery] Failed to get bridge tokens:', e);
        tokens = [];
      }
      break;
    }

    case 'moneyMarket': {
      // Get money market supported tokens from config
      try {
        // SDK API may vary - try different approaches
        const mmToken = sodax.config.getMoneyMarketToken?.(chainId as any, '');
        if (mmToken) {
          tokens = [normalizeToken(mmToken)];
        } else {
          // Fallback to getting all supported tokens
          const allTokens = (sodax.config as any).getMoneyMarketTokens?.() || [];
          tokens = allTokens.filter((t: any) => t.chainId === chainId).map(normalizeToken);
        }
      } catch (e) {
        console.warn('[discovery] Failed to get money market tokens:', e);
        tokens = [];
      }
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
 * Returns enhanced wallet info with source and supported chains
 */
async function handleWalletAddress(
  params: WalletAddressParams
): Promise<unknown> {
  const { walletId } = params;

  // Get wallet from unified WalletManager
  const walletManager = getWalletManager();
  const wallet = await walletManager.resolve(walletId);

  const address = await wallet.getAddress();

  return {
    success: true,
    walletId: wallet.nickname,
    address,
    type: wallet.type,
    chains: [...wallet.supportedChains],
  };
}

/**
 * Get user money market positions (humanized format)
 */
async function handleMoneyMarketPositions(
  params: MoneyMarketPositionsParams
): Promise<unknown> {
  const { walletId, chainId } = params;

  // Get wallet from unified WalletManager
  const walletManager = getWalletManager();
  const wallet = await walletManager.resolve(walletId);
  const walletAddress = await wallet.getAddress();

  // Get spoke provider for this wallet and chain
  const spokeProvider = await getSpokeProvider(walletId, chainId);

  const sodax = getSodaxClient();

  // Get user reserves in humanized format
  const userReservesResult = await sodax.moneyMarket.data.getUserReservesHumanized(
    spokeProvider
  );

  // SDK may return { userReserves: [...], userEmodeCategoryId: ... } or just array
  const reservesData = userReservesResult.userReserves || userReservesResult;
  const reservesArray = Array.isArray(reservesData) ? reservesData : [];

  // Format positions for readability
  const positions = reservesArray.map((reserve: any) => ({
    token: {
      address: reserve.token?.address || reserve.underlyingAsset || '',
      symbol: reserve.token?.symbol || reserve.symbol || '',
      name: reserve.token?.name || reserve.name || '',
      decimals: reserve.token?.decimals || reserve.decimals || 18,
    },
    supply: {
      balance: reserve.supply?.balance || reserve.scaledATokenBalance || '0',
      balanceUsd: reserve.supply?.balanceUsd || '0',
      apy: reserve.supply?.apy || 0,
      collateral: reserve.supply?.isCollateral ?? reserve.usageAsCollateralEnabledOnUser ?? false,
    },
    borrow: {
      balance: reserve.borrow?.balance || reserve.scaledVariableDebt || '0',
      balanceUsd: reserve.borrow?.balanceUsd || '0',
      apy: reserve.borrow?.apy || 0,
    },
    // Health indicators
    loanToValue: reserve.loanToValue || 0,
    liquidationThreshold: reserve.liquidationThreshold || 0,
  }));

  // Calculate summary metrics
  const totalSupplyUsd = positions.reduce(
    (sum: number, p: any) => sum + (parseFloat(p.supply.balanceUsd) || 0),
    0
  );
  const totalBorrowUsd = positions.reduce(
    (sum: number, p: any) => sum + (parseFloat(p.borrow.balanceUsd) || 0),
    0
  );
  const netWorthUsd = totalSupplyUsd - totalBorrowUsd;
  const healthFactor =
    totalBorrowUsd > 0 ? totalSupplyUsd / totalBorrowUsd : Infinity;

  return {
    success: true,
    walletId,
    address: walletAddress,
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
  const reservesResult = await sodax.moneyMarket.data.getReservesHumanized();

  // SDK may return ReservesDataHumanized object with .reservesData array or just array
  const reservesArray = Array.isArray(reservesResult) 
    ? reservesResult 
    : (reservesResult as any).reservesData || [];

  // Filter by chainId if provided
  let filteredReserves = reservesArray;
  if (chainId) {
    filteredReserves = reservesArray.filter(
      (r: any) => r.token?.chainId === chainId || r.hubChainId === chainId || r.chainId === chainId
    );
  }

  // Format reserves for readability
  const formattedReserves = filteredReserves.map((reserve: any) => ({
    token: {
      address: reserve.token?.address || reserve.underlyingAsset || '',
      symbol: reserve.token?.symbol || reserve.symbol || '',
      name: reserve.token?.name || reserve.name || '',
      decimals: reserve.token?.decimals || reserve.decimals || 18,
      chainId: reserve.token?.chainId || reserve.chainId || '',
    },
    liquidity: {
      totalSupply: reserve.liquidity?.totalSupply || reserve.totalScaledVariableDebt || '0',
      availableLiquidity: reserve.liquidity?.availableLiquidity || reserve.availableLiquidity || '0',
      totalBorrow: reserve.liquidity?.totalBorrow || reserve.totalVariableDebt || '0',
      utilizationRate: reserve.liquidity?.utilizationRate || reserve.utilizationRate || '0',
    },
    rates: {
      supplyApy: reserve.rates?.supplyApy || reserve.supplyAPY || '0',
      borrowApy: reserve.rates?.borrowApy || reserve.variableBorrowAPY || '0',
    },
    parameters: {
      loanToValue: reserve.parameters?.loanToValue || reserve.baseLTVasCollateral || '0',
      liquidationThreshold: reserve.parameters?.liquidationThreshold || reserve.reserveLiquidationThreshold || '0',
      liquidationBonus: reserve.parameters?.liquidationBonus || reserve.reserveLiquidationBonus || '0',
    },
    hubChainId: reserve.hubChainId || 'sonic',
  }));

  // Calculate aggregate metrics
  const totalAvailableLiquidity = formattedReserves.reduce(
    (sum: number, r: any) => sum + (parseFloat(r.liquidity.availableLiquidity) || 0),
    0
  );
  const totalBorrowed = formattedReserves.reduce(
    (sum: number, r: any) => sum + (parseFloat(r.liquidity.totalBorrow) || 0),
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
    // Get wallet address from unified WalletManager
    const walletManager = getWalletManager();
    const wallet = await walletManager.resolve(walletId);
    const walletAddress = await wallet.getAddress();

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
      walletAddress,
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
      address: walletAddress,
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
// List Wallets Tool
// ============================================================================

/**
 * List all configured wallets with their nicknames, types, and supported chains
 */
async function handleListWallets(
  _params: ListWalletsParams
): Promise<unknown> {
  console.log('[discovery:listWallets] Listing configured wallets');

  const walletManager = getWalletManager();
  const wallets = await walletManager.listWallets();

  const formattedWallets = wallets.map(w => ({
    nickname: w.nickname,
    type: w.type,
    address: w.address,
    supportedChains: w.chains,
    isDefault: w.isDefault,
  }));

  const defaultWallet = await walletManager.getDefaultWalletName();

  // Group by type for summary
  const byType = {
    'evm-wallet-skill': formattedWallets.filter(w => w.type === 'evm-wallet-skill'),
    'bankr': formattedWallets.filter(w => w.type === 'bankr'),
    'env': formattedWallets.filter(w => w.type === 'env'),
  };

  // Check if Bankr is configured but wallet not found
  const bankrKeyPresent = !!process.env.BANKR_API_KEY;
  const bankrWalletFound = byType.bankr.length > 0;

  return {
    success: true,
    wallets: formattedWallets,
    defaultWallet,
    count: formattedWallets.length,
    summary: {
      selfCustody: byType['evm-wallet-skill'].length + byType.env.length,
      bankrManaged: byType.bankr.length,
    },
    sources: {
      evmWalletSkill: byType['evm-wallet-skill'].length > 0,
      bankr: bankrWalletFound,
      bankrKeyConfigured: bankrKeyPresent,
      env: byType.env.length > 0,
    },
    hint: wallets.length === 0
      ? 'No wallets configured. Install evm-wallet-skill: git clone https://github.com/amped-finance/evm-wallet-skill.git ~/.openclaw/skills/evm-wallet-skill'
      : bankrKeyPresent && !bankrWalletFound
        ? 'Bankr API key found but wallet not loaded. Try "Add my bankr wallet" to register it.'
        : 'Use wallet nickname in operations, e.g., "swap 100 USDC to ETH using main"',
  };
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
    handler: wrapHandler(handleSupportedChains),
  });

  // 2. amped_oc_supported_tokens - Get supported tokens by module
  agentTools.register({
    name: 'amped_oc_supported_tokens',
    summary:
      'Get supported tokens for a specific module (swaps, bridge, or moneyMarket) on a given chain',
    schema: SupportedTokensSchema,
    handler: wrapHandler(handleSupportedTokens),
  });

  // 3. amped_oc_wallet_address - Get wallet address
  agentTools.register({
    name: 'amped_oc_wallet_address',
    summary:
      'Get the resolved wallet address for a given walletId. Validates private key matches in execute mode.',
    schema: WalletAddressSchema,
    handler: wrapHandler(handleWalletAddress),
  });

  // 4. amped_oc_money_market_positions - Get user positions (humanized)
  agentTools.register({
    name: 'amped_oc_money_market_positions',
    summary:
      'Get humanized money market positions for a wallet on a specific chain, including supply/borrow balances and health metrics',
    schema: MoneyMarketPositionsSchema,
    handler: wrapHandler(handleMoneyMarketPositions),
  });

  // 5. amped_oc_money_market_reserves - Get market reserves (humanized)
  agentTools.register({
    name: 'amped_oc_money_market_reserves',
    summary:
      'Get humanized money market reserves data including liquidity, rates, and parameters. Hub-centric with optional chain filtering.',
    schema: MoneyMarketReservesSchema,
    handler: wrapHandler(handleMoneyMarketReserves),
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
    handler: wrapHandler(handleCrossChainPositions),
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
    handler: wrapHandler(handleUserIntents),
  });

  // 8. amped_oc_list_wallets - List all configured wallets
  agentTools.register({
    name: 'amped_oc_list_wallets',
    summary:
      'List all configured wallets with their nicknames, types, addresses, and supported chains.',
    description:
      'Shows all available wallets from evm-wallet-skill (~/.evm-wallet.json), Bankr API, ' +
      'and environment variables (AMPED_OC_WALLETS_JSON). Each wallet has a nickname that can be ' +
      'used in operations like "swap 100 USDC using bankr" or "check balance on main". ' +
      'Also shows which chains each wallet supports.',
    schema: ListWalletsSchema,
    handler: wrapHandler(handleListWallets),
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
  ListWalletsSchema,
};

// Export handlers for testing
export {
  handleSupportedChains,
  handleSupportedTokens,
  handleWalletAddress,
  handleMoneyMarketPositions,
  handleMoneyMarketReserves,
  handleCrossChainPositions,
  handleUserIntents,
  handleListWallets,
};
