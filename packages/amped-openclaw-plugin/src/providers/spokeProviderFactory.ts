/**
 * Spoke Provider Factory
 *
 * Creates and caches spoke providers per (walletId, chainId) pair.
 * Uses EvmSpokeProvider for EVM chains and SonicSpokeProvider for Sonic hub chain.
 * 
 * Now integrates with evm-wallet-skill for RPC configuration.
 */

// Import wallet provider from wallet-sdk-core
import { EvmWalletProvider } from '@sodax/wallet-sdk-core';

// Import spoke providers and chain config from SDK
import { 
  EvmSpokeProvider, 
  SonicSpokeProvider,
  type SpokeProvider 
} from '@sodax/sdk';

// Import chain configuration from types
import { spokeChainConfig, type SpokeChainId } from '@sodax/types';

import { WalletRegistry } from '../wallet/walletRegistry';
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
} as Record<string, SpokeChainId>;

/**
 * Get RPC URL for a chain from configuration
 * Tries evm-wallet-skill first, then falls back to AMPED_OC_RPC_URLS_JSON
 *
 * @param chainId - The chain ID
 * @returns The RPC URL for the chain
 * @throws Error if RPC URL is not configured for the chain
 */
async function getRpcUrl(chainId: string): Promise<string> {
  // Use skill adapter which has default RPCs baked in
  const skillAdapter = getWalletAdapter();
  return await skillAdapter.getRpcUrl(chainId);
}

/**
 * Get the SDK chain ID for a given chain
 */
function getSdkChainId(chainId: string): SpokeChainId {
  return (CHAIN_ID_MAP[chainId] || chainId) as SpokeChainId;
}

/**
 * Create a new spoke provider for the given wallet and chain
 *
 * @param walletId - The wallet identifier
 * @param chainId - The chain identifier
 * @returns A new spoke provider instance
 */
async function createSpokeProvider(
  walletId: string,
  chainId: string
): Promise<SpokeProvider> {
  const walletRegistry = new WalletRegistry();
  const wallet = await walletRegistry.resolveWallet(walletId);

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
    throw new Error(`Chain config not found for: ${sdkChainId}`);
  }

  // Create the wallet provider first
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
    });

    return new EvmSpokeProvider(
      walletProvider,
      chainConfig as any,
      rpcUrl
    );
  }
}

/**
 * Create a raw (read-only) spoke provider for prepare mode
 *
 * @param walletId - The wallet identifier
 * @param chainId - The chain identifier
 * @returns A spoke provider instance
 */
async function createRawSpokeProvider(
  walletId: string,
  chainId: string
): Promise<SpokeProvider> {
  // For now, raw mode still needs a private key for the SDK
  // In the future, we could use EvmRawSpokeProvider or SonicRawSpokeProvider
  console.warn('[spokeProviderFactory] Raw mode requested but using full provider');
  return createSpokeProvider(walletId, chainId);
}

/**
 * Get a spoke provider for the given wallet and chain
 * Returns cached provider if available, otherwise creates a new one
 *
 * @param walletId - The wallet identifier (used for caching and wallet resolution)
 * @param chainId - The chain identifier
 * @param raw - If true, attempts to create a read-only provider (may still require private key)
 * @returns The spoke provider instance
 */
export async function getSpokeProvider(
  walletId: string,
  chainId: string,
  raw = false
): Promise<SpokeProvider> {
  const cacheKey = `${walletId}:${chainId}:${raw ? 'raw' : 'full'}`;

  // Check cache
  const cached = providerCache.get(cacheKey);
  if (cached) {
    console.log('[spokeProviderFactory] Using cached provider', {
      walletId,
      chainId,
      raw,
    });
    return cached;
  }

  // Create new provider
  const provider = raw
    ? await createRawSpokeProvider(walletId, chainId)
    : await createSpokeProvider(walletId, chainId);

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
