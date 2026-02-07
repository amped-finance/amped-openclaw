const PORTFOLIO_MAX_LINE_WIDTH = 50;

const CHAIN_EMOJIS: Record<string, string> = {
  lightlink: '⚡',
  base: '🟦',
  sonic: '⚪',
  arbitrum: '🔽',
  optimism: '🔴',
  polygon: '♾️',
  bsc: '🔶',
  ethereum: '💎',
  avalanche: '🔺',
  hyperevm: '🌀',
  kaia: '🟢',
  solana: '◎',
};

const CHAIN_PROPER_NAMES: Record<string, string> = {
  lightlink: 'LightLink',
  base: 'Base',
  sonic: 'Sonic',
  arbitrum: 'Arbitrum',
  optimism: 'Optimism',
  polygon: 'Polygon',
  bsc: 'BSC',
  ethereum: 'Ethereum',
  avalanche: 'Avalanche',
  hyperevm: 'Hyperliquid',
  kaia: 'Kaia',
  solana: 'Solana',
};

interface PortfolioWallet {
  wallet: { nickname: string; address: string; type: string };
  balances: Array<{
    chainId: string;
    chainName: string;
    native: { symbol: string; balance: string; usdValue?: string };
    tokens: Array<{ symbol: string; balance: string; address: string; usdValue?: string }>;
    chainTotalUsd?: string;
  }>;
  moneyMarket?: {
    totalSupplyUsd: string;
    totalBorrowUsd: string;
    netWorthUsd: string;
    chainBreakdown: Array<{
      chainId: string;
      supplyUsd: string;
      borrowUsd: string;
      healthFactor: string;
      healthStatus: { status: string; color: string };
    }>;
  };
  walletTotalUsd?: string;
}

interface PortfolioRenderInput {
  summary: {
    walletCount: number;
    chainsQueried: number;
    estimatedTotalUsd: string;
  };
  wallets: PortfolioWallet[];
}

function clip(line: string, max: number = PORTFOLIO_MAX_LINE_WIDTH): string {
  if (line.length <= max) return line;
  return `${line.slice(0, max - 1)}…`;
}

function fmtUsd(value?: string | number): string {
  if (value === undefined || value === null) return '$0';
  const str = String(value);
  if (!str.startsWith('$')) return `$${str}`;
  return str;
}

function shortAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function compactBalance(balance: string): string {
  const n = Number(balance);
  if (Number.isNaN(n)) return balance;
  if (n >= 1000) return n.toFixed(2);
  if (n >= 1) return n.toFixed(3);
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

function healthEmoji(status?: string): string {
  const s = (status || '').toLowerCase();
  if (s.includes('healthy')) return '🟢';
  if (s.includes('caution')) return '🟠';
  if (s.includes('danger')) return '🔴';
  if (s.includes('critical')) return '⚠️';
  return '✅';
}

function chainEmoji(chainName: string): string {
  return CHAIN_EMOJIS[chainName.toLowerCase()] || '•';
}

function chainProperName(chainName: string): string {
  const lower = chainName.toLowerCase();
  // Handle SDK format like "0x2105.base"
  if (lower.includes('.')) {
    const parts = lower.split('.');
    const name = parts[parts.length - 1];
    return CHAIN_PROPER_NAMES[name] || chainName;
  }
  return CHAIN_PROPER_NAMES[lower] || chainName;
}

function pushLine(lines: string[], line: string): void {
  lines.push(clip(line));
}

export function renderPortfolioTree(input: PortfolioRenderInput): string {
  const lines: string[] = [];
  const totalWallets = input.wallets.length;

  // Header
  pushLine(lines, `📊 Portfolio ${fmtUsd(input.summary.estimatedTotalUsd)}`);
  pushLine(lines, `├─ Wallets: ${input.summary.walletCount} | Chains: ${input.summary.chainsQueried}`);
  pushLine(lines, '│');

  input.wallets.forEach((wallet, walletIdx) => {
    const isLastWallet = walletIdx === totalWallets - 1;
    const walletPrefix = isLastWallet ? '└─' : '├─';
    const walletPad = isLastWallet ? '   ' : '│  ';

    // Wallet header
    pushLine(lines, `${walletPrefix} 🔑 ${wallet.wallet.nickname} ${fmtUsd(wallet.walletTotalUsd)}`);
    pushLine(lines, `${walletPad}├─ Address: ${shortAddress(wallet.wallet.address)}`);
    pushLine(lines, `${walletPad}│`);

    // Liquid assets section
    if (wallet.balances.length > 0) {
      const hasMM = wallet.moneyMarket?.chainBreakdown && wallet.moneyMarket.chainBreakdown.length > 0;
      const liquidPrefix = hasMM ? '├─' : '└─';
      const liquidPad = hasMM ? '│  ' : '   ';

      pushLine(lines, `${walletPad}${liquidPrefix} 💧 Liquid Assets`);

      wallet.balances.forEach((balance, balIdx) => {
        const isLastChain = balIdx === wallet.balances.length - 1;
        const chainPrefix = isLastChain ? '└─' : '├─';
        const chainPad = isLastChain ? '   ' : '│  ';

        const emoji = chainEmoji(balance.chainName);
        const properName = chainProperName(balance.chainName);

        pushLine(lines, `${walletPad}${liquidPad}${chainPrefix} ${emoji} ${properName} (${fmtUsd(balance.chainTotalUsd)})`);

        // Native token
        const hasTokens = balance.tokens && balance.tokens.length > 0;
        const nativePrefix = hasTokens ? '├─' : '└─';
        pushLine(
          lines,
          `${walletPad}${liquidPad}${chainPad}${nativePrefix} Native: ${compactBalance(balance.native.balance)} ${balance.native.symbol}`
        );

        // ERC20 tokens
        if (hasTokens) {
          balance.tokens.forEach((token, tIdx) => {
            const isLastToken = tIdx === balance.tokens.length - 1;
            const tokenPrefix = isLastToken ? '└─' : '├─';
            pushLine(
              lines,
              `${walletPad}${liquidPad}${chainPad}${tokenPrefix} ERC20: ${compactBalance(token.balance)} ${token.symbol}`
            );
          });
        }
      });

      if (hasMM) {
        pushLine(lines, `${walletPad}│`);
      }
    }

    // Money market section
    if (wallet.moneyMarket?.chainBreakdown && wallet.moneyMarket.chainBreakdown.length > 0) {
      const netWorth = fmtUsd(wallet.moneyMarket.netWorthUsd);
      pushLine(lines, `${walletPad}└─ 💰 Money Market (${netWorth} net)`);

      wallet.moneyMarket.chainBreakdown.forEach((mm, mmIdx) => {
        const isLastMM = mmIdx === wallet.moneyMarket!.chainBreakdown.length - 1;
        const mmPrefix = isLastMM ? '└─' : '├─';

        const label = mm.chainId.includes('.') ? mm.chainId.split('.').pop() || mm.chainId : mm.chainId;
        const emoji = chainEmoji(label);
        const properName = chainProperName(label);
        const hf = mm.healthFactor === '∞' ? '∞' : parseFloat(mm.healthFactor).toFixed(2);

        pushLine(
          lines,
          `${walletPad}   ${mmPrefix} ${emoji} ${properName}: $${mm.supplyUsd} supply | $${mm.borrowUsd} borrow | HF ${hf} ${healthEmoji(mm.healthStatus?.status)}`
        );
      });
    }

    // Add spacing between wallets
    if (!isLastWallet) {
      pushLine(lines, '│');
    }
  });

  return lines.join('\n');
}

export { PORTFOLIO_MAX_LINE_WIDTH };
