import type { Token } from '@sodax/types';
import { toSodaxChainId } from '../wallet/types';
import { getSupportedSwapTokensForChain } from './tokenResolver';

export const SOLVER_COMPATIBILITY_DOCS_URL =
  'https://docs.sodax.com/developers/deployments/solver-compatible-assets';

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function ensureTokenInCatalog(
  chainId: string,
  tokenAddress: string,
  role: 'source' | 'destination'
): void {
  const supported = getSupportedSwapTokensForChain(chainId);
  if (!supported || supported.length === 0) return;

  const found = supported.find(t => sameAddress(t.address, tokenAddress));
  if (found) return;

  const preview = supported.slice(0, 12).map(t => t.symbol).join(', ');
  throw new Error(
    `Token ${tokenAddress} is not currently solver-compatible as the ${role} asset on ${chainId}. ` +
      `See ${SOLVER_COMPATIBILITY_DOCS_URL}. Supported examples: ${preview}`
  );
}

export function ensureSolverCompatibleSwapRoute(params: {
  srcChainId: string;
  dstChainId: string;
  srcTokenAddress: string;
  dstTokenAddress: string;
}): void {
  ensureTokenInCatalog(params.srcChainId, params.srcTokenAddress, 'source');
  ensureTokenInCatalog(params.dstChainId, params.dstTokenAddress, 'destination');
}

export function mapSwapRoutingError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();
  if (lower.includes('unsupported token_src') || lower.includes('unsupported token_dst') || lower.includes('solver-compatible')) {
    return `${raw}. Check compatible assets: ${SOLVER_COMPATIBILITY_DOCS_URL}`;
  }
  if (lower.includes('no_path_found') || lower.includes('no path found') || lower.includes('"code":-4')) {
    return `${raw}. The solver could not find a swap path — this usually means insufficient liquidity for this pair. Try a different token pair or route through a hub chain (e.g., swap to USDC on Sonic first).`;
  }
  if (lower.includes('no_private_liquidity') || lower.includes('"code":-5')) {
    return `${raw}. The solver has no private liquidity for this route. Try a smaller amount or a different token pair.`;
  }
  return raw;
}

export async function ensureBridgeRouteAvailable(
  sodaxClient: any,
  params: {
    srcChainId: string;
    dstChainId: string;
    srcTokenAddress: string;
    dstTokenAddress?: string;
  }
): Promise<Token[]> {
  const src = toSodaxChainId(params.srcChainId);
  const dst = toSodaxChainId(params.dstChainId);
  const result = sodaxClient.bridge.getBridgeableTokens(src as any, dst as any, params.srcTokenAddress);
  if (!result?.ok) {
    throw new Error(`Bridge route unavailable for ${params.srcChainId} -> ${params.dstChainId}.`);
  }

  const bridgeable = (result.value || []) as Token[];
  if (bridgeable.length === 0) {
    throw new Error(`No bridgeable route for ${params.srcChainId} -> ${params.dstChainId}.`);
  }

  if (params.dstTokenAddress) {
    const found = bridgeable.find(t => sameAddress(t.address, params.dstTokenAddress));
    if (!found) {
      throw new Error(
        `Destination token ${params.dstTokenAddress} is not bridgeable from ${params.srcChainId} to ${params.dstChainId}.`
      );
    }
  }

  return bridgeable;
}
