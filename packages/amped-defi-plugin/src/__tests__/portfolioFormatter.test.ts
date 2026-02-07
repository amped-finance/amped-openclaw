import { renderPortfolioTree, PORTFOLIO_MAX_LINE_WIDTH } from '../utils/portfolioFormatter';

describe('portfolioFormatter', () => {
  it('renders compact emoji tree text without box/border characters', () => {
    const text = renderPortfolioTree({
      summary: {
        walletCount: 1,
        chainsQueried: 9,
        estimatedTotalUsd: '$50.54',
      },
      wallets: [
        {
          wallet: {
            nickname: 'Main Wallet',
            address: '0xD4f90123456789012345678901234567890101c5',
            type: 'eoa',
          },
          walletTotalUsd: '$31.58',
          balances: [
            {
              chainId: '30.base',
              chainName: 'Base',
              native: { symbol: 'ETH', balance: '0.009' },
              tokens: [],
              chainTotalUsd: '$18.45',
            },
          ],
          moneyMarket: {
            chainBreakdown: [
              {
                chainId: '30.base',
                supplyUsd: '6.15',
                borrowUsd: '0.06',
                healthFactor: '81.43',
                healthStatus: { status: 'healthy', color: 'green' },
              },
            ],
          },
        },
      ],
    });

    expect(text).toContain('📊 Portfolio $50.54');
    expect(text).toContain('• 🔑 Main Wallet $31.58');
    expect(text).toContain('• 🟦 Base');
    expect(text).toContain('• 💰 Money Market');
    expect(text).not.toMatch(/[╔╗╚╝╠╣═┌┐└┘─]/);

    for (const line of text.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(PORTFOLIO_MAX_LINE_WIDTH);
    }
  });
});
