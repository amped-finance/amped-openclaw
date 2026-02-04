/**
 * Cross-Chain Money Market Position Aggregator
 * 
 * Aggregates user positions across all supported chains to provide a unified view
 * of their money market portfolio, including:
 * - Total supplied/borrowed across all chains
 * - Health factor and liquidation risk
 * - Available borrowing power
 * - Net position (supply - borrow)
 * - Cross-chain collateral utilization
 */

import { getSodaxClient } from '../sodax/client';
import { getSpokeProvider } from '../providers/spokeProviderFactory';
import { getWalletManager } from '../wallet/walletManager';
import { normalizeChainId } from '../wallet/types';

/**
 * Position data for a single token on a single chain
 */
export interface TokenPosition {
  chainId: string;
  token: {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    logoURI?: string;
  };
  supply: {
    balance: string;
    balanceUsd: string;
    balanceRaw: string;
    apy: number;
    isCollateral: boolean;
  };
  borrow: {
    balance: string;
    balanceUsd: string;
    balanceRaw: string;
    apy: number;
  };
  loanToValue: number;
  liquidationThreshold: number;
}

/**
 * Aggregated position summary across all chains
 */
export interface AggregatedPositionSummary {
  totalSupplyUsd: number;
  totalBorrowUsd: number;
  netWorthUsd: number;
  availableBorrowUsd: number;
  healthFactor: number | null;
  liquidationRisk: 'none' | 'low' | 'medium' | 'high';
  weightedSupplyApy: number;
  weightedBorrowApy: number;
  netApy: number;
}

/**
 * Chain-specific position summary
 */
export interface ChainPositionSummary {
  chainId: string;
  supplyUsd: number;
  borrowUsd: number;
  netWorthUsd: number;
  healthFactor: number | null;
  positionCount: number;
}

/**
 * Complete cross-chain position view
 */
export interface CrossChainPositionView {
  walletId: string;
  address: string;
  timestamp: string;
  summary: AggregatedPositionSummary;
  chainSummaries: ChainPositionSummary[];
  positions: TokenPosition[];
  collateralUtilization: {
    totalCollateralUsd: number;
    usedCollateralUsd: number;
    availableCollateralUsd: number;
    utilizationRate: number;
  };
  riskMetrics: {
    maxLtv: number;
    currentLtv: number;
    bufferUntilLiquidation: number;
    safeMaxBorrowUsd: number;
  };
}

/**
 * Options for position aggregation
 */
export interface AggregationOptions {
  /** Specific chains to query (defaults to all supported chains) */
  chainIds?: string[];
  /** Include zero-balance positions */
  includeZeroBalances?: boolean;
  /** Minimum USD value to include (positions below this are filtered out unless includeZeroBalances is true) */
  minUsdValue?: number;
}

// ============================================================================
// Position Aggregation Functions
// ============================================================================

/**
 * Aggregate money market positions across all supported chains
 * 
 * @param walletId - The wallet identifier
 * @param options - Aggregation options
 * @returns Complete cross-chain position view
 */
export async function aggregateCrossChainPositions(
  walletId: string,
  options: AggregationOptions = {}
): Promise<CrossChainPositionView> {
  const startTime = Date.now();
  
  // Get wallet
  const walletManager = getWalletManager();
  const wallet = await walletManager.resolve(walletId);
  const walletAddress = await wallet.getAddress();

  // Get supported chains from SODAX
  const sodax = getSodaxClient();
  const sodaxChains = sodax.config.getSupportedSpokeChains();
  
  // Map SDK chains to string IDs
  const allSodaxChains = sodaxChains.map((c: any) => 
    typeof c === 'string' ? c : c.id
  );
  
  // Filter chains by what the wallet supports
  // This is important for Bankr which only supports ethereum/polygon/base
  const walletSupportedChains = wallet.supportedChains;
  const filteredChains = allSodaxChains.filter((chainId: string) => 
    wallet.supportsChain(chainId)
  );
  
  // Determine which chains to query
  const chainsToQuery = options.chainIds || filteredChains;
  
  console.log('[positionAggregator] Wallet chain filter', {
    walletType: wallet.type,
    walletSupports: walletSupportedChains,
    sodaxChains: allSodaxChains,
    filteredChains: filteredChains,
    normalizedFiltered: filteredChains.map(normalizeChainId),
  });
  
  console.log('[positionAggregator] Querying positions across chains', {
    walletId,
    address: walletAddress,
    chains: chainsToQuery,
  });

  // Query positions from all chains in parallel
  const chainResults = await Promise.allSettled(
    chainsToQuery.map(chainId => queryChainPositions(walletId, walletAddress, chainId))
  );

  // Collect all positions
  const allPositions: TokenPosition[] = [];
  const chainSummaries: ChainPositionSummary[] = [];

  chainResults.forEach((result, index) => {
    const chainId = chainsToQuery[index];
    
    if (result.status === 'fulfilled') {
      const { positions, summary } = result.value;
      
      if (positions.length > 0 || options.includeZeroBalances) {
        allPositions.push(...positions);
        chainSummaries.push(summary);
      }
    } else {
      console.warn(`[positionAggregator] Failed to query chain ${chainId}:`, result.reason);
    }
  });

  // Calculate aggregated summary
  const summary = calculateAggregatedSummary(allPositions);
  
  // Calculate collateral utilization
  const collateralUtilization = calculateCollateralUtilization(allPositions, summary);
  
  // Calculate risk metrics
  const riskMetrics = calculateRiskMetrics(allPositions, summary);
  
  const view: CrossChainPositionView = {
    walletId,
    address: walletAddress,
    timestamp: new Date().toISOString(),
    summary,
    chainSummaries: chainSummaries.sort((a, b) => b.netWorthUsd - a.netWorthUsd),
    positions: allPositions.sort((a, b) => 
      (parseFloat(b.supply.balanceUsd) + parseFloat(b.borrow.balanceUsd)) -
      (parseFloat(a.supply.balanceUsd) + parseFloat(a.borrow.balanceUsd))
    ),
    collateralUtilization,
    riskMetrics,
  };

  console.log('[positionAggregator] Aggregation complete', {
    durationMs: Date.now() - startTime,
    totalPositions: allPositions.length,
    totalSupplyUsd: summary.totalSupplyUsd,
    totalBorrowUsd: summary.totalBorrowUsd,
    healthFactor: summary.healthFactor,
  });

  return view;
}

/**
 * Query positions for a single chain
 */
async function queryChainPositions(
  _walletId: string,
  address: string,
  chainId: string
): Promise<{ positions: TokenPosition[]; summary: ChainPositionSummary }> {
  try {
    // Use address for spoke provider lookup
    const spokeProvider = await getSpokeProvider(address, chainId);
    const sodax = getSodaxClient();

    // Get user reserves in humanized format
    const userReservesResult = await sodax.moneyMarket.data.getUserReservesHumanized(spokeProvider);

    // SDK may return { userReserves: [...] } or just array
    const reservesData = (userReservesResult as any).userReserves || userReservesResult;
    const userReserves = Array.isArray(reservesData) ? reservesData : [];

    // Convert to TokenPosition format
    const positions: TokenPosition[] = userReserves.map((reserve: any) => ({
      chainId,
      token: {
        address: reserve.token?.address || reserve.underlyingAsset || '',
        symbol: reserve.token?.symbol || reserve.symbol || '',
        name: reserve.token?.name || reserve.name || '',
        decimals: reserve.token?.decimals || reserve.decimals || 18,
        logoURI: reserve.token?.logoURI || reserve.logoURI,
      },
      supply: {
        balance: reserve.supply?.balance || reserve.scaledATokenBalance || '0',
        balanceUsd: reserve.supply?.balanceUsd || '0',
        balanceRaw: reserve.supply?.balanceRaw || '0',
        apy: reserve.supply?.apy || 0,
        isCollateral: reserve.supply?.isCollateral ?? reserve.usageAsCollateralEnabledOnUser ?? false,
      },
      borrow: {
        balance: reserve.borrow?.balance || reserve.scaledVariableDebt || '0',
        balanceUsd: reserve.borrow?.balanceUsd || '0',
        balanceRaw: reserve.borrow?.balanceRaw || '0',
        apy: reserve.borrow?.apy || 0,
      },
      loanToValue: reserve.loanToValue || 0,
      liquidationThreshold: reserve.liquidationThreshold || 0,
    }));

    // Calculate chain summary
    const supplyUsd = positions.reduce((sum, p) => sum + parseFloat(p.supply.balanceUsd || '0'), 0);
    const borrowUsd = positions.reduce((sum, p) => sum + parseFloat(p.borrow.balanceUsd || '0'), 0);
    
    // Calculate health factor for this chain
    const healthFactor = calculateChainHealthFactor(positions);

    const summary: ChainPositionSummary = {
      chainId,
      supplyUsd,
      borrowUsd,
      netWorthUsd: supplyUsd - borrowUsd,
      healthFactor,
      positionCount: positions.length,
    };

    return { positions, summary };
  } catch (error) {
    console.error(`[positionAggregator] Error querying ${chainId}:`, error);
    throw error;
  }
}

// ============================================================================
// Calculation Helpers
// ============================================================================

/**
 * Calculate aggregated summary across all positions
 */
function calculateAggregatedSummary(positions: TokenPosition[]): AggregatedPositionSummary {
  let totalSupplyUsd = 0;
  let totalBorrowUsd = 0;
  let weightedSupplyApy = 0;
  let weightedBorrowApy = 0;

  positions.forEach(pos => {
    const supplyUsd = parseFloat(pos.supply.balanceUsd || '0');
    const borrowUsd = parseFloat(pos.borrow.balanceUsd || '0');

    totalSupplyUsd += supplyUsd;
    totalBorrowUsd += borrowUsd;
    weightedSupplyApy += supplyUsd * pos.supply.apy;
    weightedBorrowApy += borrowUsd * pos.borrow.apy;
  });

  // Calculate weighted average APYs
  const avgSupplyApy = totalSupplyUsd > 0 ? weightedSupplyApy / totalSupplyUsd : 0;
  const avgBorrowApy = totalBorrowUsd > 0 ? weightedBorrowApy / totalBorrowUsd : 0;

  // Calculate health factor
  const healthFactor = calculateHealthFactor(positions);

  // Determine liquidation risk
  let liquidationRisk: AggregatedPositionSummary['liquidationRisk'] = 'none';
  if (healthFactor !== null) {
    if (healthFactor < 1.1) liquidationRisk = 'high';
    else if (healthFactor < 1.5) liquidationRisk = 'medium';
    else if (healthFactor < 2) liquidationRisk = 'low';
  }

  // Calculate available borrow (simplified - would need proper oracle prices)
  // This is a conservative estimate based on average LTV
  const avgLtv = positions.length > 0
    ? positions.reduce((sum, p) => sum + p.loanToValue, 0) / positions.length
    : 0;
  const availableBorrowUsd = totalSupplyUsd * avgLtv - totalBorrowUsd;

  return {
    totalSupplyUsd,
    totalBorrowUsd,
    netWorthUsd: totalSupplyUsd - totalBorrowUsd,
    availableBorrowUsd: Math.max(0, availableBorrowUsd),
    healthFactor,
    liquidationRisk,
    weightedSupplyApy: avgSupplyApy,
    weightedBorrowApy: avgBorrowApy,
    netApy: totalSupplyUsd > 0 
      ? (avgSupplyApy * totalSupplyUsd - avgBorrowApy * totalBorrowUsd) / totalSupplyUsd 
      : 0,
  };
}

/**
 * Calculate collateral utilization metrics
 */
function calculateCollateralUtilization(
  positions: TokenPosition[],
  summary: AggregatedPositionSummary
): CrossChainPositionView['collateralUtilization'] {
  // Only count collateral-enabled supplies
  const totalCollateralUsd = positions
    .filter(p => p.supply.isCollateral)
    .reduce((sum, p) => sum + parseFloat(p.supply.balanceUsd || '0'), 0);

  const usedCollateralUsd = summary.totalBorrowUsd;
  const availableCollateralUsd = Math.max(0, totalCollateralUsd - usedCollateralUsd);
  const utilizationRate = totalCollateralUsd > 0 ? (usedCollateralUsd / totalCollateralUsd) * 100 : 0;

  return {
    totalCollateralUsd,
    usedCollateralUsd,
    availableCollateralUsd,
    utilizationRate,
  };
}

/**
 * Calculate risk metrics
 */
function calculateRiskMetrics(
  positions: TokenPosition[],
  summary: AggregatedPositionSummary
): CrossChainPositionView['riskMetrics'] {
  // Calculate max LTV across all positions (weighted by supply)
  let totalSupply = 0;
  let weightedLtvSum = 0;
  let liquidationThresholdSum = 0;

  positions.forEach(pos => {
    const supplyUsd = parseFloat(pos.supply.balanceUsd || '0');
    totalSupply += supplyUsd;
    weightedLtvSum += supplyUsd * pos.loanToValue;
    liquidationThresholdSum += supplyUsd * pos.liquidationThreshold;
  });

  const maxLtv = totalSupply > 0 ? weightedLtvSum / totalSupply : 0;
  const avgLiquidationThreshold = totalSupply > 0 ? liquidationThresholdSum / totalSupply : 0;

  // Current LTV
  const currentLtv = summary.totalSupplyUsd > 0 
    ? summary.totalBorrowUsd / summary.totalSupplyUsd 
    : 0;

  // Buffer until liquidation (percentage points)
  const bufferUntilLiquidation = Math.max(0, avgLiquidationThreshold - currentLtv) * 100;

  // Safe max borrow (at 80% of liquidation threshold for safety)
  const safeMaxBorrowUsd = summary.totalSupplyUsd * avgLiquidationThreshold * 0.8;

  return {
    maxLtv,
    currentLtv,
    bufferUntilLiquidation,
    safeMaxBorrowUsd,
  };
}

/**
 * Calculate health factor for a set of positions
 * Health Factor = (Total Collateral in ETH * Liquidation Threshold) / Total Borrow in ETH
 */
function calculateHealthFactor(positions: TokenPosition[]): number | null {
  let totalCollateralEth = 0;
  let totalBorrowEth = 0;

  positions.forEach(pos => {
    const supplyUsd = parseFloat(pos.supply.balanceUsd || '0');
    const borrowUsd = parseFloat(pos.borrow.balanceUsd || '0');

    // Only count collateral-enabled supplies
    if (pos.supply.isCollateral) {
      totalCollateralEth += supplyUsd * pos.liquidationThreshold;
    }
    totalBorrowEth += borrowUsd;
  });

  if (totalBorrowEth === 0) {
    return totalCollateralEth > 0 ? Infinity : null;
  }

  return totalCollateralEth / totalBorrowEth;
}

/**
 * Calculate health factor for a single chain
 */
function calculateChainHealthFactor(positions: TokenPosition[]): number | null {
  return calculateHealthFactor(positions);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format health factor for display
 */
export function formatHealthFactor(hf: number | null): string {
  if (hf === null) return 'N/A';
  if (hf === Infinity) return '∞';
  return hf.toFixed(2);
}

/**
 * Get health factor color/styling indicator
 */
export function getHealthFactorStatus(hf: number | null): {
  status: 'healthy' | 'caution' | 'danger' | 'critical';
  color: 'green' | 'yellow' | 'orange' | 'red';
} {
  if (hf === null) return { status: 'healthy', color: 'green' };
  if (hf === Infinity) return { status: 'healthy', color: 'green' };
  if (hf < 1.1) return { status: 'critical', color: 'red' };
  if (hf < 1.5) return { status: 'danger', color: 'orange' };
  if (hf < 2) return { status: 'caution', color: 'yellow' };
  return { status: 'healthy', color: 'green' };
}

/**
 * Get recommendation based on position health
 */
export function getPositionRecommendation(view: CrossChainPositionView): string[] {
  const recommendations: string[] = [];
  const { summary } = view;

  // Health factor recommendations
  if (summary.healthFactor !== null && summary.healthFactor < 1.5) {
    recommendations.push('⚠️ Health factor is low. Consider repaying debt or adding collateral.');
  }

  // Borrowing capacity recommendations
  if (summary.availableBorrowUsd > 1000 && summary.healthFactor !== null && summary.healthFactor > 2) {
    recommendations.push(`💡 You have $${summary.availableBorrowUsd.toFixed(2)} in available borrowing power.`);
  }

  // Collateral utilization
  if (view.collateralUtilization.utilizationRate > 80) {
    recommendations.push('⚠️ High collateral utilization. Avoid borrowing more to maintain safety margin.');
  }

  // Net APY optimization
  if (summary.netApy < 0) {
    recommendations.push('📉 Your borrowing costs exceed supply earnings. Consider reducing debt or finding higher APY supply opportunities.');
  }

  // Cross-chain opportunities
  const highApyChains = view.chainSummaries
    .filter(cs => cs.supplyUsd > 100)
    .sort((a, b) => (b.healthFactor || Infinity) - (a.healthFactor || Infinity));
  
  if (highApyChains.length > 1) {
    recommendations.push(`🌐 You have positions across ${highApyChains.length} chains. Monitor each chain's health factor independently.`);
  }

  return recommendations;
}
