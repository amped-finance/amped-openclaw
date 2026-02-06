const mockGetSodaxClient = jest.fn();
const mockGetSpokeProvider = jest.fn();
const mockResolveToken = jest.fn();
const mockGetTokenInfo = jest.fn();
const mockToSodaxChainId = jest.fn();
const mockCheckMoneyMarket = jest.fn();
const mockResolveWallet = jest.fn();
const mockWaitForTransactionReceipt = jest.fn();

jest.mock('../sodax/client', () => ({
  getSodaxClient: mockGetSodaxClient,
}));

jest.mock('../providers/spokeProviderFactory', () => ({
  getSpokeProvider: mockGetSpokeProvider,
}));

jest.mock('../utils/tokenResolver', () => ({
  resolveToken: mockResolveToken,
  getTokenInfo: mockGetTokenInfo,
}));

jest.mock('../wallet/types', () => ({
  toSodaxChainId: mockToSodaxChainId,
}));

jest.mock('../policy/policyEngine', () => ({
  PolicyEngine: jest.fn().mockImplementation(() => ({
    checkMoneyMarket: mockCheckMoneyMarket,
  })),
}));

jest.mock('../wallet/walletManager', () => ({
  getWalletManager: jest.fn(() => ({
    resolve: mockResolveWallet,
  })),
}));

import { handleRepay, handleWithdraw } from '../tools/moneyMarket';

describe('moneyMarket handlers', () => {
  const maxUint256 = (2n ** 256n) - 1n;
  const moneyMarket = {
    isAllowanceValid: jest.fn(),
    approve: jest.fn(),
    supply: jest.fn(),
    withdraw: jest.fn(),
    borrow: jest.fn(),
    repay: jest.fn(),
    data: {
      getReservesHumanized: jest.fn(),
    },
  };
  const isMoneyMarketSupportedToken = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockGetSodaxClient.mockReturnValue({
      moneyMarket,
      config: {
        isMoneyMarketSupportedToken,
      },
    });
    mockGetSpokeProvider.mockResolvedValue({
      walletProvider: {
        waitForTransactionReceipt: mockWaitForTransactionReceipt,
      },
    });
    mockResolveWallet.mockResolvedValue({
      getAddress: jest.fn().mockResolvedValue('0xWallet'),
    });
    mockResolveToken.mockResolvedValue('0xToken');
    mockGetTokenInfo.mockResolvedValue({ decimals: 6 });
    mockCheckMoneyMarket.mockResolvedValue({ allowed: true });
    mockToSodaxChainId.mockImplementation((chainId: string) => {
      if (chainId === 'sonic') return '146';
      if (chainId === 'base') return '30';
      return chainId;
    });
    isMoneyMarketSupportedToken.mockReturnValue(true);

    moneyMarket.isAllowanceValid.mockResolvedValue({ ok: true, value: true });
    moneyMarket.approve.mockResolvedValue({ ok: true, value: '0xApprove' });
    moneyMarket.withdraw.mockResolvedValue({ ok: true, value: ['0xSpoke', '0xHub'] });
    moneyMarket.repay.mockResolvedValue({ ok: true, value: ['0xSpoke', '0xHub'] });
    moneyMarket.data.getReservesHumanized.mockResolvedValue({ reservesData: [] });
  });

  it('allows hub-chain source MM withdraw and parses [spokeTxHash, hubTxHash] tuple', async () => {
    const result = await handleWithdraw({
      walletId: 'main',
      chainId: 'sonic',
      token: 'USDC',
      amount: '1',
    } as any);

    expect(result.success).toBe(true);
    expect(result.spokeTxHash).toBe('0xSpoke');
    expect(result.hubTxHash).toBe('0xHub');
    expect(moneyMarket.withdraw).toHaveBeenCalledTimes(1);
  });

  it('fails fast when allowance check fails and does not execute withdraw', async () => {
    moneyMarket.isAllowanceValid.mockResolvedValueOnce({
      ok: false,
      error: { code: 'ALLOWANCE_CHECK_FAILED' },
    });

    const result = await handleWithdraw({
      walletId: 'main',
      chainId: 'base',
      token: 'USDC',
      amount: '1',
    } as any);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed to check allowance');
    expect(moneyMarket.withdraw).not.toHaveBeenCalled();
  });

  it('uses max uint256 when withdrawType=all', async () => {
    const result = await handleWithdraw({
      walletId: 'main',
      chainId: 'base',
      token: 'USDC',
      amount: '1',
      withdrawType: 'all',
    } as any);

    expect(result.success).toBe(true);
    const withdrawParams = moneyMarket.withdraw.mock.calls[0][0];
    expect(withdrawParams.amount).toBe(maxUint256);
  });

  it('normalizes aToken-style withdraw input to supported underlying token', async () => {
    const aTokenAddr = '0x4effb5813271699683c25c734f4dabc45b363709';
    const underlyingAddr = '0x4200000000000000000000000000000000000006';

    mockResolveToken.mockImplementation(async () => aTokenAddr);
    isMoneyMarketSupportedToken.mockImplementation((chainId: string, token: string) => {
      return chainId === '30' && token.toLowerCase() === underlyingAddr.toLowerCase();
    });
    moneyMarket.data.getReservesHumanized.mockResolvedValue({
      reservesData: [
        {
          underlyingAsset: underlyingAddr,
          aTokenAddress: aTokenAddr,
          symbol: 'ETH',
        },
      ],
    });

    const result = await handleWithdraw({
      walletId: 'main',
      chainId: 'base',
      token: 'sodaETH',
      amount: '1',
    } as any);

    expect(result.success).toBe(true);
    const allowanceParams = moneyMarket.isAllowanceValid.mock.calls[0][0];
    const withdrawParams = moneyMarket.withdraw.mock.calls[0][0];
    expect(allowanceParams.token).toBe(underlyingAddr.toLowerCase());
    expect(withdrawParams.token).toBe(underlyingAddr.toLowerCase());
  });

  it('uses max uint256 for repayAll and normalizes collateralChainId', async () => {
    const result = await handleRepay({
      walletId: 'main',
      chainId: 'base',
      token: 'USDC',
      amount: '1',
      repayAll: true,
      collateralChainId: 'sonic',
    } as any);

    expect(result.success).toBe(true);
    const repayParams = moneyMarket.repay.mock.calls[0][0];
    expect(repayParams.amount).toBe(maxUint256);
    expect(repayParams.toChainId).toBe('146');
  });
});
