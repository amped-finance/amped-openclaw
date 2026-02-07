const PORTFOLIO_MAX_LINE_WIDTH = 36;

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

function fmtUsd(value?: string): string {
  if (!value) return '$0';
  if (!value.startsWith('$')) return `$${value}`;
  return value;
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

function pushLine(lines: string[], line: string): void {
  lines.push(clip(line));
}

export function renderPortfolioTree(input: PortfolioRenderInput): string {
  const lines: string[] = [];

  pushLine(lines, `📊 Portfolio ${fmtUsd(input.summary.estimatedTotalUsd)}`);
  pushLine(lines, `• wallets: ${input.summary.walletCount} | chains: ${input.summary.chainsQueried}`);

  for (const wallet of input.wallets) {
    pushLine(lines, `• 🔑 ${wallet.wallet.nickname} ${fmtUsd(wallet.walletTotalUsd)}`);
    pushLine(lines, `  • ${shortAddress(wallet.wallet.address)}`);

    for (const balance of wallet.balances) {
      const emoji = chainEmoji(balance.chainName);
      const native = `${compactBalance(balance.native.balance)} ${balance.native.symbol}`;
      pushLine(lines, `  • ${emoji} ${balance.chainName} ${native} ${fmtUsd(balance.chainTotalUsd)}`);
    }

    if (wallet.moneyMarket?.chainBreakdown?.length) {
      pushLine(lines, '  • 💰 Money Market');
      for (const mm of wallet.moneyMarket.chainBreakdown) {
        const label = mm.chainId.includes('.') ? mm.chainId.split('.').pop() || mm.chainId : mm.chainId;
        const emoji = chainEmoji(label);
        const hf = mm.healthFactor === '∞' ? '∞' : mm.healthFactor;
        pushLine(
          lines,
          `    • ${emoji} ${label} $${mm.supplyUsd}/$${mm.borrowUsd} HF ${hf} ${healthEmoji(mm.healthStatus?.status)}`
        );
      }
    }
  }

  return lines.join('\n');
}

export { PORTFOLIO_MAX_LINE_WIDTH };
