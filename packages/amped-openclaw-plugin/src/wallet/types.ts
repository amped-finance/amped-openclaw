/**
 * Wallet Types - Multi-source wallet management
 * 
 * Supports:
 * - evm-wallet-skill (local key from ~/.evm-wallet.json)
 * - Bankr (API-based, limited chains)
 * - Environment variables (AMPED_OC_WALLETS_JSON)
 */

import type { Address, Hash } from 'viem';

/**
 * Supported wallet backend types
 */
export type WalletBackendType = 'evm-wallet-skill' | 'bankr' | 'env';

/**
 * Raw transaction for Bankr submission
 */
export interface RawTransaction {
  to: Address;
  data: `0x${string}`;
  value: string;  // Wei as string
  chainId: number;
}

/**
 * Wallet info returned by list operations
 */
export interface WalletInfo {
  nickname: string;
  type: WalletBackendType;
  address: Address;
  chains: string[];
  isDefault: boolean;
}

/**
 * Wallet backend interface
 * Different implementations for different sources
 */
export interface IWalletBackend {
  readonly type: WalletBackendType;
  readonly nickname: string;
  readonly supportedChains: readonly string[];
  
  /**
   * Get the wallet address
   */
  getAddress(): Promise<Address>;
  
  /**
   * Check if this wallet supports a specific chain
   */
  supportsChain(chainId: string): boolean;
  
  /**
   * Get private key (for local/env wallets)
   * Returns undefined for Bankr (no local key access)
   */
  getPrivateKey?(): Promise<`0x${string}`>;
  
  /**
   * Send raw transaction via Bankr API
   * Only available for Bankr backend
   */
  sendRawTransaction?(tx: RawTransaction): Promise<Hash>;
  
  /**
   * Check if backend is ready/configured
   */
  isReady(): Promise<boolean>;
}

/**
 * Wallet configuration from wallets.json
 */
export interface WalletConfig {
  source: WalletBackendType;
  
  // For evm-wallet-skill
  path?: string;
  
  // For Bankr
  apiKey?: string;
  apiUrl?: string;
  
  // For env
  envVar?: string;
  address?: Address;
  privateKey?: `0x${string}`;
  
  // Chain restrictions (optional)
  chains?: string[];
}

/**
 * Wallets config file structure
 */
export interface WalletsConfigFile {
  wallets: Record<string, WalletConfig>;
  default?: string;
}

/**
 * Chain IDs for Bankr submission
 */
export const BANKR_CHAIN_IDS: Record<string, number> = {
  ethereum: 1,
  polygon: 137,
  base: 8453,
  unichain: 130,
};

/**
 * Chains supported by Bankr
 */
export const BANKR_SUPPORTED_CHAINS = ['ethereum', 'polygon', 'base'] as const;

/**
 * All SODAX-supported chains
 */
export const SODAX_SUPPORTED_CHAINS = [
  'ethereum',
  'base', 
  'polygon',
  'arbitrum',
  'optimism',
  'sonic',
  'avalanche',
  'bsc',
] as const;

/**
 * Check if a chain is supported by Bankr
 */
export function isBankrSupportedChain(chainId: string): boolean {
  return BANKR_SUPPORTED_CHAINS.includes(chainId as any);
}

/**
 * Get numeric chain ID for Bankr
 */
export function getBankrChainId(chainId: string): number {
  const id = BANKR_CHAIN_IDS[chainId];
  if (!id) {
    throw new Error(`Chain ${chainId} not supported by Bankr. Supported: ${BANKR_SUPPORTED_CHAINS.join(', ')}`);
  }
  return id;
}
