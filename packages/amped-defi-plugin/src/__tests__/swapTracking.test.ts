const mockGetSodaxClient = jest.fn();
const mockGetSpokeProvider = jest.fn();
const mockResolveToken = jest.fn();
const mockGetTokenInfo = jest.fn();
const mockGetSupportedSwapTokensForChain = jest.fn();
const mockToSodaxChainId = jest.fn();
const mockCheckSwap = jest.fn();
const mockResolveWallet = jest.fn();
const mockGetSodaxApiClient = jest.fn();

jest.mock('../sodax/client', () => ({
  getSodaxClient: mockGetSodaxClient,
}));

jest.mock('../providers/spokeProviderFactory', () => ({
  getSpokeProvider: mockGetSpokeProvider,
}));

jest.mock('../utils/tokenResolver', () => ({
  resolveToken: mockResolveToken,
  getTokenInfo: mockGetTokenInfo,
  getSupportedSwapTokensForChain: mockGetSupportedSwapTokensForChain,
}));

jest.mock('../wallet/types', () => ({
  toSodaxChainId: mockToSodaxChainId,
}));

jest.mock('../policy/policyEngine', () => ({
  PolicyEngine: jest.fn().mockImplementation(() => ({
    checkSwap: mockCheckSwap,
  })),
}));

jest.mock('../wallet/walletManager', () => ({
  getWalletManager: jest.fn(() => ({
    resolve: mockResolveWallet,
  })),
}));

jest.mock('../utils/sodaxApi', () => ({
  getSodaxApiClient: mockGetSodaxApiClient,
}));

import { handleSwapQuote, handleSwapExecute, handleSwapStatus } from '../tools/swap';

describe('swap tracking contract', () => {
  const swaps = {
    isAllowanceValid: jest.fn(),
    approve: jest.fn(),
    swap: jest.fn(),
    getQuote: jest.fn(),
  };
  const getSupportedSwapTokensByChainId = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSodaxClient.mockReturnValue({
      swaps,
      config: {
        getSupportedSwapTokensByChainId,
      },
    });
    mockGetSpokeProvider.mockResolvedValue({
      walletProvider: {
        waitForTransactionReceipt: jest.fn(),
      },
    });
    mockResolveWallet.mockResolvedValue({
      getAddress: jest.fn().mockResolvedValue('0xWallet'),
    });
    mockResolveToken.mockResolvedValue('0xToken');
    mockGetTokenInfo.mockResolvedValue({ decimals: 18 });
    mockToSodaxChainId.mockImplementation((chainId: string) => chainId);
    getSupportedSwapTokensByChainId.mockImplementation((chainId: string) => {
      if (chainId === 'base') {
        return [{ address: '0xtoken', symbol: 'USDC', decimals: 6 }];
      }
      if (chainId === 'arbitrum') {
        return [{ address: '0xtoken', symbol: 'USDT', decimals: 6 }];
      }
      return [];
    });
    mockGetSupportedSwapTokensForChain.mockImplementation((chainId: string) =>
      getSupportedSwapTokensByChainId(chainId)
    );
    mockCheckSwap.mockResolvedValue({ allowed: true });
    swaps.isAllowanceValid.mockResolvedValue({ ok: true, value: true });
    swaps.approve.mockResolvedValue({ ok: true, value: '0xApprove' });
  });

  it('returns unified tracking links from swap execute', async () => {
    swaps.swap.mockResolvedValue({
      ok: true,
      value: [{ intent_hash: '123' }, undefined, { srcTxHash: '0xSrc', hubTxHash: '0xHub' }],
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        open: false,
        events: [{ eventType: 'intent-filled', txHash: '0xDst' }],
        intent: { dstChain: 30 },
      }),
    }) as any;

    const result = await handleSwapExecute({
      walletId: 'main',
      quote: {
        srcChainId: 'base',
        dstChainId: 'arbitrum',
        srcToken: 'USDC',
        dstToken: 'USDT',
        inputAmount: '1',
        outputAmount: '0.99',
        slippageBps: 100,
        deadline: Math.floor(Date.now() / 1000) + 600,
      },
    } as any);

    expect(result.status).toBe('delivered');
    expect(result.spokeTxHash).toBe('0xSrc');
    expect(result.hubTxHash).toBe('0xHub');
    expect(result.intentHash).toBe('0x7b');
    expect((result as any).tracking?.sourceTx?.explorerUrl).toBe('https://basescan.org/tx/0xSrc');
    expect((result as any).tracking?.hubTx?.explorerUrl).toBe('https://sonicscan.org/tx/0xHub');
    expect((result as any).tracking?.destinationTx?.explorerUrl).toBe('https://basescan.org/tx/0xDst');
    expect((result as any).tracking?.intent?.sodaxScanUrl).toBe('https://sodaxscan.com/intents/0x7b');
  });

  it('rejects non solver-compatible token addresses with docs link', async () => {
    mockGetSupportedSwapTokensForChain.mockReturnValue([
      { address: '0x0000000000000000000000000000000000000001', symbol: 'USDC', decimals: 6 },
    ]);
    swaps.getQuote.mockResolvedValue({ ok: true, value: {} });

    await expect(
      handleSwapQuote({
        walletId: 'main',
        srcChainId: 'base',
        dstChainId: 'arbitrum',
        srcToken: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        dstToken: '0xtoken',
        amount: '1',
        type: 'exact_input',
        slippageBps: 100,
      } as any)
    ).rejects.toThrow('solver-compatible');
    await expect(
      handleSwapQuote({
        walletId: 'main',
        srcChainId: 'base',
        dstChainId: 'arbitrum',
        srcToken: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        dstToken: '0xtoken',
        amount: '1',
        type: 'exact_input',
        slippageBps: 100,
      } as any)
    ).rejects.toThrow('https://docs.sodax.com/developers/deployments/solver-compatible-assets');
    expect(swaps.getQuote).not.toHaveBeenCalled();
  });

  it('returns the same tracking contract from swap status', async () => {
    mockGetSodaxApiClient.mockReturnValue({
      getIntentByHash: jest.fn().mockResolvedValue({
        intentHash: '0xIntent',
        txHash: '0xHub',
        open: false,
        intent: {
          srcChain: 30,
          dstChain: 42161,
          inputToken: '0xTokenA',
          outputToken: '0xTokenB',
          inputAmount: '1000',
          minOutputAmount: '900',
          deadline: String(Math.floor(Date.now() / 1000) + 600),
        },
        events: [{ eventType: 'intent-filled', txHash: '0xDst', intentState: { receivedOutput: '950' } }],
        createdAt: new Date().toISOString(),
      }),
      getIntentByTxHash: jest.fn(),
    });

    const result = await handleSwapStatus({
      intentHash: '0xIntent',
      txHash: '0xSpoke',
    });

    expect(result.status).toBe('filled');
    expect(result.spokeTxHash).toBe('0xSpoke');
    expect(result.hubTxHash).toBe('0xHub');
    expect((result as any).tracking?.sourceTx?.explorerUrl).toBe('https://basescan.org/tx/0xSpoke');
    expect((result as any).tracking?.hubTx?.explorerUrl).toBe('https://sonicscan.org/tx/0xHub');
    expect((result as any).tracking?.destinationTx?.explorerUrl).toBe('https://arbiscan.io/tx/0xDst');
    expect((result as any).tracking?.intent?.sodaxScanUrl).toBe('https://sodaxscan.com/intents/0xIntent');
  });
});
