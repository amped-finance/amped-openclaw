/**
 * Spoke Provider Factory
 *
 * Creates and caches spoke providers per (walletId, chainId) pair.
 * Uses EvmSpokeProvider for EVM chains and SonicSpokeProvider for Sonic hub chain.
 * 
 * Now integrates with evm-wallet-skill for RPC configuration.
 */

// Note: Provider types may vary by SDK version - using any for compatibility
// import { EvmSpokeProvider, SonicSpokeProvider } from '@sodax/wallet-sdk-core';
type EvmSpokeProvider = any;
type SonicSpokeProvider = any;
import { WalletRegistry } from '../wallet/walletRegistry';
import { getWalletAdapter } from '../wallet/skillWalletAdapter';

// Type for spoke providers
type SpokeProvider = EvmSpokeProvider | SonicSpokeProvider;

// Cache for spoke providers: Map<cacheKey, SpokeProvider>
const providerCache = new Map<string, SpokeProvider>();

// Sonic hub chain identifier
const SONIC_CHAIN_ID = 'sonic';

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

  const rpcUrl = await getRpcUrl(chainId);

  // Use SonicSpokeProvider for Sonic hub chain, EvmSpokeProvider for others
  if (chainId === SONIC_CHAIN_ID) {
    console.log('[spokeProviderFactory] Creating SonicSpokeProvider', {
      walletId,
      chainId,
    });

    return new SonicSpokeProvider({
      rpcUrl,
      privateKey: wallet.privateKey,
      address: wallet.address,
    });
  } else {
    console.log('[spokeProviderFactory] Creating EvmSpokeProvider', {
      walletId,
      chainId,
    });

    return new EvmSpokeProvider({
      rpcUrl,
      privateKey: wallet.privateKey,
      address: wallet.address,
    });
  }
}

/**
 * Create a raw (address-only) spoke provider for prepare mode
 *
 * @param walletId - The wallet identifier
 * @param chainId - The chain identifier
 * @returns A new raw spoke provider instance
 */
async function createRawSpokeProvider(
  walletId: string,
  chainId: string
): Promise<SpokeProvider> {
  const walletRegistry = new WalletRegistry();
  const wallet = await walletRegistry.resolveWallet(walletId);

  if (!wallet) {
    throw new Error(`Wallet not found: ${walletId}`);
  }

  const rpcUrl = await getRpcUrl(chainId);

  // Raw mode: address only, no private key
  if (chainId === SONIC_CHAIN_ID) {
    return new SonicSpokeProvider({
      rpcUrl,
      address: wallet.address,
    });
  } else {
    return new EvmSpokeProvider({
      rpcUrl,
      address: wallet.address,
    });
  }
}

/**
 * Get a spoke provider for the given wallet and chain
 * Returns cached provider if available, otherwise creates a new one
 *
 * @param walletId - The wallet identifier (used for caching and wallet resolution)
 * @param chainId - The chain identifier
 * @param raw - If true, creates a read-only provider (address-only mode)
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

export { SpokeProvider };
