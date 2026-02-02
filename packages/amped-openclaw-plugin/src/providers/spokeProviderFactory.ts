/**
 * Spoke Provider Factory
 *
 * Creates and caches spoke providers per (walletId, chainId) pair.
 * Uses EvmSpokeProvider for EVM chains and SonicSpokeProvider for Sonic hub chain.
 * 
 * Now uses AmpedWalletProvider instead of wallet-sdk-core's EvmWalletProvider
 * to support all chains including LightLink and HyperEVM.
 * 
 * Supports pluggable wallet backends:
 * - localKey: Uses evm-wallet-skill local private keys (default)
 * - bankr: Uses Bankr Agent API for transaction execution
 */

// Import our custom wallet provider instead of wallet-sdk-core
import { AmpedWalletProvider, getDefaultRpcUrl } from '../wallet/providers';

// Import backend configuration
import { getBackendConfig, getBankrConfig } from '../wallet/backendConfig';

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
  'hyperevm': 'hyper',
  'hyper': 'hyper',
} as Record<string, SpokeChainId>;

/**
 * Get RPC URL for a chain from configuration
 * Tries evm-wallet-skill first, then falls back to built-in defaults
 *
 * @param chainId - The chain ID
 * @returns The RPC URL for the chain
 * @throws Error if RPC URL is not configured for the chain
 */
async function getRpcUrl(chainId: string): Promise<string> {
  // Try skill adapter first (may have custom RPCs)
  try {
    const skillAdapter = getWalletAdapter();
    return await skillAdapter.getRpcUrl(chainId);
  } catch {
    // Fall back to built-in defaults from our chain config
    return getDefaultRpcUrl(chainId);
  }
}

/**
 * Get the SDK chain ID for a given chain
 */
function getSdkChainId(chainId: string): SpokeChainId {
  return (CHAIN_ID_MAP[chainId] || chainId) as SpokeChainId;
}

/**
 * Create a spoke provider using local key backend
 */
async function createLocalKeySpokeProvider(
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

  // Create the wallet provider using AmpedWalletProvider with local key backend
  const walletProvider = await AmpedWalletProvider.fromPrivateKey({
    privateKey: wallet.privateKey as `0x${string}`,
    chainId: sdkChainId,
    rpcUrl: rpcUrl,
  });

  return createSpokeProviderFromWallet(walletProvider, chainId, sdkChainId, chainConfig, rpcUrl, walletId);
}

/**
 * Create a spoke provider using Bankr backend
 */
async function createBankrSpokeProviderInternal(
  walletId: string,
  chainId: string
): Promise<SpokeProvider> {
  const bankrConfig = getBankrConfig();
  
  if (!bankrConfig) {
    throw new Error('Bankr backend selected but not configured. Set BANKR_API_KEY environment variable.');
  }

  // For Bankr, we need to get the user's Bankr wallet address
  // This could come from querying Bankr API or from config
  // For now, we'll use a placeholder that will be filled by the first API call
  const userAddress = process.env.BANKR_WALLET_ADDRESS as `0x${string}` || '0x0000000000000000000000000000000000000000' as `0x${string}`;

  const rpcUrl = await getRpcUrl(chainId);
  const sdkChainId = getSdkChainId(chainId);

  // Get chain config from SDK
  const chainConfig = spokeChainConfig[sdkChainId];
  if (!chainConfig) {
    throw new Error(`Chain config not found for: ${sdkChainId}`);
  }

  // Create the wallet provider using AmpedWalletProvider with Bankr backend
  const walletProvider = await AmpedWalletProvider.fromBankr({
    bankrApiUrl: bankrConfig.apiUrl,
    bankrApiKey: bankrConfig.apiKey,
    userAddress: userAddress,
    chainId: sdkChainId,
    rpcUrl: rpcUrl,
  });

  console.log('[spokeProviderFactory] Creating provider with Bankr backend', {
    walletId,
    chainId,
    sdkChainId,
  });

  return createSpokeProviderFromWallet(walletProvider, chainId, sdkChainId, chainConfig, rpcUrl, walletId);
}

/**
 * Create a spoke provider from an AmpedWalletProvider
 */
function createSpokeProviderFromWallet(
  walletProvider: any,
  chainId: string,
  sdkChainId: SpokeChainId,
  chainConfig: any,
  rpcUrl: string,
  walletId: string
): SpokeProvider {
  // Use SonicSpokeProvider for Sonic hub chain, EvmSpokeProvider for others
  if (chainId === SONIC_CHAIN_ID) {
    console.log('[spokeProviderFactory] Creating SonicSpokeProvider', {
      walletId,
      chainId,
      backend: walletProvider.getBackendType(),
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
      backend: walletProvider.getBackendType(),
    });

    return new EvmSpokeProvider(
      walletProvider,
      chainConfig as any,
      rpcUrl
    );
  }
}

/**
 * Create a new spoke provider for the given wallet and chain
 * Automatically selects backend based on configuration
 *
 * @param walletId - The wallet identifier
 * @param chainId - The chain identifier
 * @returns A new spoke provider instance
 */
async function createSpokeProvider(
  walletId: string,
  chainId: string
): Promise<SpokeProvider> {
  const config = getBackendConfig();

  if (config.backend === 'bankr') {
    return createBankrSpokeProviderInternal(walletId, chainId);
  } else {
    return createLocalKeySpokeProvider(walletId, chainId);
  }
}

/**
 * Create a spoke provider with a Bankr backend (explicit)
 * 
 * This allows execution through Bankr's API instead of local keys.
 *
 * @param bankrConfig - Bankr backend configuration
 * @param chainId - The chain identifier
 * @returns A new spoke provider instance
 */
export async function createBankrSpokeProvider(
  bankrConfig: {
    bankrApiUrl: string;
    bankrApiKey: string;
    userAddress: `0x${string}`;
  },
  chainId: string
): Promise<SpokeProvider> {
  const rpcUrl = await getRpcUrl(chainId);
  const sdkChainId = getSdkChainId(chainId);

  // Get chain config from SDK
  const chainConfig = spokeChainConfig[sdkChainId];
  if (!chainConfig) {
    throw new Error(`Chain config not found for: ${sdkChainId}`);
  }

  // Create the wallet provider using Bankr backend
  const walletProvider = await AmpedWalletProvider.fromBankr({
    bankrApiUrl: bankrConfig.bankrApiUrl,
    bankrApiKey: bankrConfig.bankrApiKey,
    userAddress: bankrConfig.userAddress,
    chainId: sdkChainId,
    rpcUrl: rpcUrl,
  });

  // Use SonicSpokeProvider for Sonic hub chain, EvmSpokeProvider for others
  if (chainId === SONIC_CHAIN_ID) {
    console.log('[spokeProviderFactory] Creating SonicSpokeProvider with Bankr backend', {
      chainId,
      userAddress: bankrConfig.userAddress,
    });

    return new SonicSpokeProvider(
      walletProvider,
      chainConfig as any,
      rpcUrl
    );
  } else {
    console.log('[spokeProviderFactory] Creating EvmSpokeProvider with Bankr backend', {
      chainId,
      sdkChainId,
      userAddress: bankrConfig.userAddress,
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
  const config = getBackendConfig();
  const cacheKey = `${walletId}:${chainId}:${config.backend}:${raw ? 'raw' : 'full'}`;

  // Check cache
  const cached = providerCache.get(cacheKey);
  if (cached) {
    console.log('[spokeProviderFactory] Using cached provider', {
      walletId,
      chainId,
      backend: config.backend,
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

/**
 * Get current backend type being used
 */
export function getCurrentBackend(): string {
  return getBackendConfig().backend;
}

// Export the type for use in other modules
export type { SpokeProvider };
