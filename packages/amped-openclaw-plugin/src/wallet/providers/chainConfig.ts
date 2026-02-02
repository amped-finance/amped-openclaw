/**
 * Chain Configuration for Amped Wallet Provider
 * 
 * Complete chain configuration including all SODAX-supported chains
 * plus LightLink and HyperEVM which are missing from wallet-sdk-core.
 * 
 * This replaces wallet-sdk-core's incomplete getEvmViemChain() function.
 */

import { defineChain, type Chain } from 'viem';
import {
  mainnet,
  arbitrum,
  optimism,
  base,
  polygon,
  bsc,
  avalanche,
  sonic,
  lightlinkPhoenix,
} from 'viem/chains';

/**
 * Chain ID constants matching @sodax/types
 */
export const CHAIN_IDS = {
  // Standard EVM chains
  ETHEREUM: 1,
  ARBITRUM: 42161,
  OPTIMISM: 10,
  BASE: 8453,
  POLYGON: 137,
  BSC: 56,
  AVALANCHE: 43114,
  
  // Hub chain
  SONIC: 146,
  
  // Additional chains (missing from wallet-sdk-core)
  LIGHTLINK: 1890,
  HYPEREVM: 999,
} as const;

/**
 * SDK chain ID format mapping (e.g., 'ethereum', '0x2105.base')
 */
export const SDK_CHAIN_ID_MAP: Record<string, number> = {
  'ethereum': CHAIN_IDS.ETHEREUM,
  'arbitrum': CHAIN_IDS.ARBITRUM,
  '0xa4b1.arbitrum': CHAIN_IDS.ARBITRUM,
  'optimism': CHAIN_IDS.OPTIMISM,
  '0xa.optimism': CHAIN_IDS.OPTIMISM,
  'base': CHAIN_IDS.BASE,
  '0x2105.base': CHAIN_IDS.BASE,
  'polygon': CHAIN_IDS.POLYGON,
  '0x89.polygon': CHAIN_IDS.POLYGON,
  'bsc': CHAIN_IDS.BSC,
  '0x38.bsc': CHAIN_IDS.BSC,
  'avalanche': CHAIN_IDS.AVALANCHE,
  'avax': CHAIN_IDS.AVALANCHE,
  '0xa86a.avax': CHAIN_IDS.AVALANCHE,
  'sonic': CHAIN_IDS.SONIC,
  'lightlink': CHAIN_IDS.LIGHTLINK,
  'hyperevm': CHAIN_IDS.HYPEREVM,
  'hyper': CHAIN_IDS.HYPEREVM,
};

/**
 * HyperEVM chain definition (not in viem/chains)
 * Copied from @sodax/sdk constants.ts
 */
export const hyper = defineChain({
  id: CHAIN_IDS.HYPEREVM,
  name: 'HyperEVM',
  nativeCurrency: { decimals: 18, name: 'HYPE', symbol: 'HYPE' },
  rpcUrls: { 
    default: { http: ['https://rpc.hyperliquid.xyz/evm'] } 
  },
  blockExplorers: { 
    default: { name: 'HyperEVMScan', url: 'https://hyperevmscan.io/' } 
  },
  contracts: { 
    multicall3: { 
      address: '0xcA11bde05977b3631167028862bE2a173976CA11', 
      blockCreated: 13051 
    } 
  },
});

/**
 * Chain configuration by numeric ID
 */
const CHAIN_CONFIG: Record<number, Chain> = {
  [CHAIN_IDS.ETHEREUM]: mainnet,
  [CHAIN_IDS.ARBITRUM]: arbitrum,
  [CHAIN_IDS.OPTIMISM]: optimism,
  [CHAIN_IDS.BASE]: base,
  [CHAIN_IDS.POLYGON]: polygon,
  [CHAIN_IDS.BSC]: bsc,
  [CHAIN_IDS.AVALANCHE]: avalanche,
  [CHAIN_IDS.SONIC]: sonic,
  [CHAIN_IDS.LIGHTLINK]: lightlinkPhoenix,
  [CHAIN_IDS.HYPEREVM]: hyper,
};

/**
 * Default RPC URLs for all supported chains
 */
export const DEFAULT_RPC_URLS: Record<number, string> = {
  [CHAIN_IDS.ETHEREUM]: 'https://eth.llamarpc.com',
  [CHAIN_IDS.ARBITRUM]: 'https://arb1.arbitrum.io/rpc',
  [CHAIN_IDS.OPTIMISM]: 'https://mainnet.optimism.io',
  [CHAIN_IDS.BASE]: 'https://mainnet.base.org',
  [CHAIN_IDS.POLYGON]: 'https://polygon-rpc.com',
  [CHAIN_IDS.BSC]: 'https://bsc-dataseed.binance.org',
  [CHAIN_IDS.AVALANCHE]: 'https://api.avax.network/ext/bc/C/rpc',
  [CHAIN_IDS.SONIC]: 'https://rpc.soniclabs.com',
  [CHAIN_IDS.LIGHTLINK]: 'https://replicator.phoenix.lightlink.io/rpc/v1',
  [CHAIN_IDS.HYPEREVM]: 'https://rpc.hyperliquid.xyz/evm',
};

/**
 * Resolve SDK chain ID format to numeric chain ID
 * 
 * @param sdkChainId - Chain ID in SDK format (e.g., 'lightlink', '0x2105.base', 1)
 * @returns Numeric chain ID
 * @throws Error if chain ID cannot be resolved
 */
export function resolveChainId(sdkChainId: string | number): number {
  // Already numeric
  if (typeof sdkChainId === 'number') {
    return sdkChainId;
  }

  // Try direct lookup
  const lower = sdkChainId.toLowerCase();
  if (SDK_CHAIN_ID_MAP[lower] !== undefined) {
    return SDK_CHAIN_ID_MAP[lower];
  }

  // Try parsing as hex
  if (lower.startsWith('0x')) {
    const parsed = parseInt(lower, 16);
    if (!isNaN(parsed)) {
      return parsed;
    }
  }

  // Try parsing as decimal string
  const parsed = parseInt(sdkChainId, 10);
  if (!isNaN(parsed)) {
    return parsed;
  }

  throw new Error(`Unable to resolve chain ID: ${sdkChainId}`);
}

/**
 * Get viem Chain configuration for a chain ID
 * 
 * This is the replacement for wallet-sdk-core's getEvmViemChain()
 * 
 * @param chainId - Chain ID (SDK format or numeric)
 * @returns viem Chain configuration
 * @throws Error if chain is not supported
 */
export function getViemChain(chainId: string | number): Chain {
  const numericId = resolveChainId(chainId);
  const chain = CHAIN_CONFIG[numericId];
  
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${chainId} (resolved to ${numericId})`);
  }
  
  return chain;
}

/**
 * Get default RPC URL for a chain
 * 
 * @param chainId - Chain ID (SDK format or numeric)
 * @returns Default RPC URL
 * @throws Error if no default RPC is configured
 */
export function getDefaultRpcUrl(chainId: string | number): string {
  const numericId = resolveChainId(chainId);
  const rpcUrl = DEFAULT_RPC_URLS[numericId];
  
  if (!rpcUrl) {
    throw new Error(`No default RPC URL for chain ID: ${chainId} (resolved to ${numericId})`);
  }
  
  return rpcUrl;
}

/**
 * Check if a chain is supported
 * 
 * @param chainId - Chain ID (SDK format or numeric)
 * @returns true if chain is supported
 */
export function isChainSupported(chainId: string | number): boolean {
  try {
    const numericId = resolveChainId(chainId);
    return numericId in CHAIN_CONFIG;
  } catch {
    return false;
  }
}

/**
 * Get all supported chain IDs
 * 
 * @returns Array of supported numeric chain IDs
 */
export function getSupportedChainIds(): number[] {
  return Object.keys(CHAIN_CONFIG).map(Number);
}

/**
 * Get chain name
 * 
 * @param chainId - Chain ID (SDK format or numeric)
 * @returns Chain name
 */
export function getChainName(chainId: string | number): string {
  const chain = getViemChain(chainId);
  return chain.name;
}
