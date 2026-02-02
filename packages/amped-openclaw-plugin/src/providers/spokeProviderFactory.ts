/**
 * Spoke Provider Factory
 *
 * Creates and caches wallet providers per (walletId, chainId) pair.
 * Uses EvmWalletProvider from @sodax/wallet-sdk-core for all EVM chains.
 * 
 * Now integrates with evm-wallet-skill for RPC configuration.
 */

import { EvmWalletProvider } from '@sodax/wallet-sdk-core';
import { WalletRegistry } from '../wallet/walletRegistry';
import { getWalletAdapter } from '../wallet/skillWalletAdapter';

// Type for spoke/wallet providers - using the SDK's provider type
type SpokeProvider = EvmWalletProvider;

// Cache for providers: Map<cacheKey, SpokeProvider>
const providerCache = new Map<string, SpokeProvider>();

// Chain ID mapping for SDK (some chains need numeric IDs)
const CHAIN_ID_MAP: Record<string, string> = {
  'sonic': 'sonic',
  'ethereum': 'ethereum',
  'arbitrum': '0xa4b1.arbitrum',
  'optimism': '0xa.optimism',
  'base': '0x2105.base',
  'polygon': '0x89.polygon',
  'bsc': '0x38.bsc',
  'avalanche': '0xa86a.avax',
  'lightlink': 'lightlink',
};

/**
 * Get RPC URL for a chain from configuration
 * Tries evm-wallet-skill first, then falls back to AMPED_OC_RPC_URLS_JSON
 *
 * @param chainId - The chain ID
 * @returns The RPC URL for the chain
 * @throws Error if RPC URL is not configured for the chain
 */
async function getRpcUrl(chainId: string): Promise<string> {
  // Try skill adapter first
  const skillAdapter = getWalletAdapter();
  if (skillAdapter.isUsingSkillRpcs()) {
    try {
      return await skillAdapter.getRpcUrl(chainId);
    } catch {
      // Fall through to legacy config
    }
  }

  // Fallback to AMPED_OC_RPC_URLS_JSON
  const rpcUrlsJson = process.env.AMPED_OC_RPC_URLS_JSON;

  if (!rpcUrlsJson) {
    throw new Error(
      'RPC URL not configured. Set EVM_RPC_URLS_JSON (via evm-wallet-skill) ' +
        'or AMPED_OC_RPC_URLS_JSON environment variable.'
    );
  }

  try {
    const rpcUrls = JSON.parse(rpcUrlsJson) as Record<string, string>;
    const rpcUrl = rpcUrls[chainId];

    if (!rpcUrl) {
      throw new Error(`RPC URL not configured for chain: ${chainId}`);
    }

    return rpcUrl;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in AMPED_OC_RPC_URLS_JSON: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get the SDK chain ID for a given chain
 */
function getSdkChainId(chainId: string): string {
  return CHAIN_ID_MAP[chainId] || chainId;
}

/**
 * Create a new wallet provider for the given wallet and chain
 *
 * @param walletId - The wallet identifier
 * @param chainId - The chain identifier
 * @returns A new wallet provider instance
 */
async function createWalletProvider(
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

  console.log('[spokeProviderFactory] Creating EvmWalletProvider', {
    walletId,
    chainId,
    sdkChainId,
  });

  // Create EvmWalletProvider with private key config
  // SDK expects: { privateKey, chainId, rpcUrl? }
  return new EvmWalletProvider({
    privateKey: wallet.privateKey as `0x${string}`,
    chainId: sdkChainId as any,
    rpcUrl: rpcUrl as `http${string}`,
  });
}

/**
 * Create a raw (read-only) provider for prepare mode
 * Note: EvmWalletProvider requires a private key, so for read-only mode
 * we may need a different approach or throw an error
 *
 * @param walletId - The wallet identifier
 * @param chainId - The chain identifier
 * @returns A wallet provider instance
 */
async function createRawProvider(
  walletId: string,
  chainId: string
): Promise<SpokeProvider> {
  // For now, raw mode still needs a private key for the SDK
  // In the future, we could use a read-only viem client instead
  console.warn('[spokeProviderFactory] Raw mode requested but SDK requires private key');
  return createWalletProvider(walletId, chainId);
}

/**
 * Get a spoke/wallet provider for the given wallet and chain
 * Returns cached provider if available, otherwise creates a new one
 *
 * @param walletId - The wallet identifier (used for caching and wallet resolution)
 * @param chainId - The chain identifier
 * @param raw - If true, attempts to create a read-only provider (may still require private key)
 * @returns The wallet provider instance
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
    ? await createRawProvider(walletId, chainId)
    : await createWalletProvider(walletId, chainId);

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
