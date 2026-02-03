/**
 * Spoke Provider Factory
 *
 * Creates and caches spoke providers per (walletId, chainId) pair.
 * Uses the official SDK's EvmWalletProvider from @sodax/wallet-sdk-core.
 * 
 * Following the SDK demo implementation:
 * https://github.com/icon-project/sodax-frontend/blob/main/apps/node/src/swap.ts
 */

// Official SDK wallet provider
import { EvmWalletProvider } from '@sodax/wallet-sdk-core';

// Import spoke providers and chain config from SDK
import { 
  EvmSpokeProvider, 
  SonicSpokeProvider,
  type SpokeProvider 
} from '@sodax/sdk';

// Import chain configuration from types
import { spokeChainConfig, type SpokeChainId } from '@sodax/types';

// Import unified wallet manager (supports evm-wallet-skill, env vars, etc.)
import { getWalletManager } from '../wallet/walletManager';
import { getWalletAdapter } from '../wallet/skillWalletAdapter';

// Cache for providers: Map<cacheKey, SpokeProvider>
const providerCache = new Map<string, SpokeProvider>();

// Sonic hub chain identifier
const SONIC_CHAIN_ID = 'sonic';

// Chain ID mapping for SDK (some chains need specific format)
const CHAIN_ID_MAP: Record<string, SpokeChainId> = {
  'sonic': 'sonic',
  'ethereum': 'ethereum',
  'arbitrum': '0xa4b1.arbitrum',
  'optimism': '0xa.optimism',
  'base': '0x2105.base',
  'polygon': '0x89.polygon',
  'bsc': '0x38.bsc',
  'avalanche': '0xa86a.avax',
  'lightlink': 'lightlink',
  'hyperevm': 'hyper',
  'hyper': 'hyper',
} as Record<string, SpokeChainId>;

/**
 * Get RPC URL for a chain
 */
async function getRpcUrl(chainId: string): Promise<string> {
  const skillAdapter = getWalletAdapter();
  return skillAdapter.getRpcUrl(chainId);
}

/**
 * Get the SDK chain ID for a given chain
 */
function getSdkChainId(chainId: string): SpokeChainId {
  return (CHAIN_ID_MAP[chainId] || chainId) as SpokeChainId;
}

/**
 * Create a spoke provider for the given wallet and chain
 * Uses the official SDK's EvmWalletProvider directly (like the demo)
 */
async function createSpokeProvider(
  walletId: string,
  chainId: string
): Promise<SpokeProvider> {
  // Get wallet from unified manager (supports evm-wallet-skill, env vars, etc.)
  const walletManager = getWalletManager();
  const wallet = await walletManager.resolve(walletId);
  
  if (!wallet) {
    throw new Error(`Wallet not found: ${walletId}`);
  }

  if (!wallet.privateKey) {
    throw new Error(`Wallet ${walletId} has no private key (required for execute mode)`);
  }

  const rpcUrl = await getRpcUrl(chainId);
  const sdkChainId = getSdkChainId(chainId);

  // Get chain config from SDK
  const chainConfig = spokeChainConfig[sdkChainId];
  if (!chainConfig) {
    throw new Error(`Chain config not found for: ${sdkChainId}. Available: ${Object.keys(spokeChainConfig).join(', ')}`);
  }

  // Create wallet provider using official SDK (like the demo)
  const walletProvider = new EvmWalletProvider({
    privateKey: wallet.privateKey as `0x${string}`,
    chainId: sdkChainId,
    rpcUrl: rpcUrl as `http${string}`,
  });

  // Use SonicSpokeProvider for Sonic hub chain, EvmSpokeProvider for others
  if (chainId === SONIC_CHAIN_ID) {
    console.log('[spokeProviderFactory] Creating SonicSpokeProvider', {
      walletId,
      chainId,
      address: wallet.address?.slice(0, 10) + '...',
    });

    return new SonicSpokeProvider(
      walletProvider,
      chainConfig as any,
      rpcUrl
    );
  } else {
    console.log('[spokeProviderFactory] Creating EvmSpokeProvider', {
      walletId,
      chainId,
      sdkChainId,
      address: wallet.address?.slice(0, 10) + '...',
    });

    return new EvmSpokeProvider(
      walletProvider,
      chainConfig as any,
      rpcUrl
    );
  }
}

/**
 * Get a spoke provider for the given wallet and chain
 * Returns cached provider if available, otherwise creates a new one
 *
 * @param walletId - The wallet identifier (used for caching and wallet resolution)
 * @param chainId - The chain identifier
 * @param raw - If true, still creates full provider (raw mode not yet supported)
 * @returns The spoke provider instance
 */
export async function getSpokeProvider(
  walletId: string,
  chainId: string,
  raw = false
): Promise<SpokeProvider> {
  const cacheKey = `${walletId}:${chainId}`;

  // Check cache
  const cached = providerCache.get(cacheKey);
  if (cached) {
    console.log('[spokeProviderFactory] Using cached provider', {
      walletId,
      chainId,
    });
    return cached;
  }

  // Create new provider
  const provider = await createSpokeProvider(walletId, chainId);

  // Cache the provider
  providerCache.set(cacheKey, provider);

  return provider;
}

/**
 * Clear the provider cache
 * Useful for testing or when wallet configuration changes
 */
export function clearProviderCache(): void {
  providerCache.clear();
  console.log('[spokeProviderFactory] Provider cache cleared');
}

/**
 * Get cache statistics
 * @returns Object with cache size and keys
 */
export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: providerCache.size,
    keys: Array.from(providerCache.keys()),
  };
}

// Export the type for use in other modules
export type { SpokeProvider };
