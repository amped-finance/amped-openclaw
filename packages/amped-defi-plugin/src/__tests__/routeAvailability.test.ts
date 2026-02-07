const mockGetSupportedSwapTokensForChain = jest.fn();
const mockToSodaxChainId = jest.fn((chainId: string) => chainId);

jest.mock('../utils/tokenResolver', () => ({
  getSupportedSwapTokensForChain: mockGetSupportedSwapTokensForChain,
}));

jest.mock('../wallet/types', () => ({
  toSodaxChainId: mockToSodaxChainId,
}));

import {
  ensureBridgeRouteAvailable,
  ensureSolverCompatibleSwapRoute,
  mapSwapRoutingError,
  SOLVER_COMPATIBILITY_DOCS_URL,
} from '../utils/routeAvailability';

describe('routeAvailability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts swap routes when both tokens are solver-compatible', () => {
    mockGetSupportedSwapTokensForChain.mockImplementation((chainId: string) => {
      if (chainId === 'base') return [{ address: '0xaaa' }];
      if (chainId === 'arbitrum') return [{ address: '0xbbb' }];
      return [];
    });

    expect(() =>
      ensureSolverCompatibleSwapRoute({
        srcChainId: 'base',
        dstChainId: 'arbitrum',
        srcTokenAddress: '0xAAA',
        dstTokenAddress: '0xBBB',
      })
    ).not.toThrow();
  });

  it('throws with docs link for unsupported swap tokens', () => {
    mockGetSupportedSwapTokensForChain.mockReturnValue([{ address: '0xaaa', symbol: 'USDC' }]);

    expect(() =>
      ensureSolverCompatibleSwapRoute({
        srcChainId: 'base',
        dstChainId: 'arbitrum',
        srcTokenAddress: '0xAAA',
        dstTokenAddress: '0xCCC',
      })
    ).toThrow(SOLVER_COMPATIBILITY_DOCS_URL);
  });

  it('maps SDK unsupported-token errors to include docs link', () => {
    const message = mapSwapRoutingError('Unsupported token_src for route');
    expect(message).toContain(SOLVER_COMPATIBILITY_DOCS_URL);
  });

  it('validates bridge routes and destination token compatibility', async () => {
    const sodaxClient = {
      bridge: {
        getBridgeableTokens: jest.fn().mockReturnValue({
          ok: true,
          value: [{ address: '0xbbb' }],
        }),
      },
    };

    await expect(
      ensureBridgeRouteAvailable(sodaxClient, {
        srcChainId: 'base',
        dstChainId: 'sonic',
        srcTokenAddress: '0xaaa',
        dstTokenAddress: '0xbbb',
      })
    ).resolves.toEqual([{ address: '0xbbb' }]);

    expect(mockToSodaxChainId).toHaveBeenCalledWith('base');
    expect(mockToSodaxChainId).toHaveBeenCalledWith('sonic');
  });

  it('throws when bridge route has no tokens', async () => {
    const sodaxClient = {
      bridge: {
        getBridgeableTokens: jest.fn().mockReturnValue({ ok: true, value: [] }),
      },
    };

    await expect(
      ensureBridgeRouteAvailable(sodaxClient, {
        srcChainId: 'base',
        dstChainId: 'sonic',
        srcTokenAddress: '0xaaa',
      })
    ).rejects.toThrow('No bridgeable route');
  });
});
