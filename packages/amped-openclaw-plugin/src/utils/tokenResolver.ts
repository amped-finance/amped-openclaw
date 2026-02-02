/**
 * Token Resolution Utility
 * 
 * Resolves token symbols to addresses using the SODAX SDK config service.
 * Supports case-insensitive symbol lookup with caching.
 */

import type { Token } from '@sodax/types';
import { getSodaxClient } from '../sodax/client';

// Cache tokens per chain to avoid repeated lookups
const tokenCache = new Map<string, Token[]>();

/**
 * Check if a string is a valid Ethereum address
 */
function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/i.test(value);
}

/**
 * Resolve a token symbol or address to a normalized address
 * 
 * @param chainId - The chain ID to resolve the token on
 * @param tokenInput - Token symbol (e.g., "USDC") or address
 * @returns The token address (lowercase)
 * @throws Error if token symbol is not found on the chain
 */
export async function resolveToken(
  chainId: string,
  tokenInput: string
): Promise<string> {
  // If already an address, normalize and return
  if (isAddress(tokenInput)) {
    return tokenInput.toLowerCase();
  }

  // Get tokens from SDK config service
  let tokens = tokenCache.get(chainId);
  if (!tokens) {
    try {
      const client = getSodaxClient();
      const configService = (client as any).configService;
      
      if (configService?.getSwapTokensByChainId) {
        tokens = configService.getSwapTokensByChainId(chainId) as Token[];
      } else if (configService?.getSwapTokens) {
        const allTokens = configService.getSwapTokens();
        tokens = allTokens[chainId] || [];
      } else {
        console.warn(`[tokenResolver] configService not available, falling back to empty token list`);
        tokens = [];
      }
      
      tokenCache.set(chainId, tokens);
    } catch (err) {
      console.error(`[tokenResolver] Failed to fetch tokens for chain ${chainId}:`, err);
      tokens = [];
      tokenCache.set(chainId, tokens);
    }
  }

  // Find by symbol (case-insensitive)
  const symbolUpper = tokenInput.toUpperCase();
  const token = tokens.find(t => t.symbol.toUpperCase() === symbolUpper);
  
  if (!token) {
    // Build helpful error message with available tokens
    const available = tokens.length > 0 
      ? tokens.map(t => t.symbol).join(', ')
      : 'No tokens loaded';
    throw new Error(
      `Unknown token "${tokenInput}" on chain ${chainId}. ` +
      `Available: ${available}. ` +
      `Alternatively, provide the token address directly.`
    );
  }

  return token.address.toLowerCase();
}

/**
 * Resolve multiple tokens at once (for efficiency)
 * 
 * @param chainId - The chain ID
 * @param tokenInputs - Array of token symbols or addresses
 * @returns Array of resolved addresses
 */
export async function resolveTokens(
  chainId: string,
  tokenInputs: string[]
): Promise<string[]> {
  return Promise.all(tokenInputs.map(t => resolveToken(chainId, t)));
}

/**
 * Get token info by symbol or address
 * Returns null if not found
 */
export async function getTokenInfo(
  chainId: string,
  tokenInput: string
): Promise<Token | null> {
  // Ensure cache is populated
  let tokens = tokenCache.get(chainId);
  if (!tokens) {
    try {
      await resolveToken(chainId, 'USDC'); // Force cache population
    } catch {
      // Ignore - we just want to populate cache
    }
    tokens = tokenCache.get(chainId) || [];
  }

  // Find by address or symbol
  if (isAddress(tokenInput)) {
    const addrLower = tokenInput.toLowerCase();
    return tokens.find(t => t.address.toLowerCase() === addrLower) || null;
  } else {
    const symbolUpper = tokenInput.toUpperCase();
    return tokens.find(t => t.symbol.toUpperCase() === symbolUpper) || null;
  }
}

/**
 * Clear the token cache (useful for testing or after config refresh)
 */
export function clearTokenCache(): void {
  tokenCache.clear();
}

/**
 * Get all cached tokens for a chain
 */
export function getCachedTokens(chainId: string): Token[] | undefined {
  return tokenCache.get(chainId);
}
