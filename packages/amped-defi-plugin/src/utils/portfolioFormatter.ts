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

/**
 * Format a chain balance in compact form: "Chain: 0.123 ETH, 4.56 USDC ($5.67)"
 */
function formatChainCompact(balance: PortfolioWallet['balances'][0]): string {
  const emoji = chainEmoji(balance.chainName);
  const properName = chainProperName(balance.chainName);
  const parts: string[] = [];

  // Native token
  if (parseFloat(balance.native.balance) > 0) {
    parts.push(`${compactBalance(balance.native.balance)} ${balance.native.symbol}`);
  }

  // Tokens (max 2, or sum them up)
  const nonZeroTokens = balance.tokens.filter(t => parseFloat(t.balance) > 0);
  if (nonZeroTokens.length > 0) {
    // Show first 2 tokens, or summarize if more
    const tokensToShow = nonZeroTokens.slice(0, 2);
    tokensToShow.forEach(t => {
      parts.push(`${compactBalance(t.balance)} ${t.symbol}`);
    });
    if (nonZeroTokens.length > 2) {
      parts.push(`+${nonZeroTokens.length - 2} more`);
    }
  }

  const valueStr = balance.chainTotalUsd ? ` (${balance.chainTotalUsd})` : '';
  return `${emoji} ${properName}: ${parts.join(', ')}${valueStr}`;
}

/**
 * Format money market in compact form: "MM: $X supply, $Y borrow, HF Z ✅"
 */
function formatMMCompact(mm: PortfolioWallet['moneyMarket']): string {
  if (!mm) return '';

  // Get overall health factor from chain breakdown (weighted average or worst)
  // Use the minimum health factor across chains as the conservative measure
  let worstHF = Infinity;
  let worstStatus = { status: 'healthy', color: 'green' };

  for (const chain of mm.chainBreakdown) {
    const hf = chain.healthFactor === '∞' ? Infinity : parseFloat(chain.healthFactor);
    if (hf < worstHF) {
      worstHF = hf;
      worstStatus = chain.healthStatus;
    }
  }

  const hfStr = worstHF === Infinity ? '∞' : worstHF.toFixed(2);
  const emoji = healthEmoji(worstStatus.status);
  return `💰 MM: $${mm.totalSupplyUsd} supply, $${mm.totalBorrowUsd} borrow, HF ${hfStr} ${emoji}`;
}

export function renderPortfolioTree(input: PortfolioRenderInput): string {
  const lines: string[] = [];

  // Header
  pushLine(lines, `📊 Portfolio — ${fmtUsd(input.summary.estimatedTotalUsd)}`);

  input.wallets.forEach((wallet) => {
    // Wallet header with truncated address
    pushLine(lines, '');
    pushLine(lines, `🔑 ${wallet.wallet.nickname} — ${fmtUsd(wallet.walletTotalUsd)}`);
    pushLine(lines, `\`${shortAddress(wallet.wallet.address)}\``);

    // Sort balances by USD value (descending)
    const sortedBalances = [...wallet.balances].sort((a, b) => {
      const aVal = parseFloat(a.chainTotalUsd?.replace('$', '') || '0');
      const bVal = parseFloat(b.chainTotalUsd?.replace('$', '') || '0');
      return bVal - aVal;
    });

    // Show top 3 chains, group the rest
    const topChains = sortedBalances.slice(0, 3);
    const otherChains = sortedBalances.slice(3);

    topChains.forEach(balance => {
      pushLine(lines, `  ${formatChainCompact(balance)}`);
    });

    // Group smaller chains - show emojis of chains in the group
    if (otherChains.length > 0) {
      const otherTotal = otherChains.reduce((sum, b) => {
        return sum + parseFloat(b.chainTotalUsd?.replace('$', '') || '0');
      }, 0);
      const chainEmojis = otherChains.map(b => chainEmoji(b.chainName)).join('');
      pushLine(lines, `  ⛓️ ${chainEmojis} [${otherChains.length} other chains: $${otherTotal.toFixed(2)}]`);
    }

    // Money market (single line)
    if (wallet.moneyMarket && wallet.moneyMarket.chainBreakdown.length > 0) {
      pushLine(lines, `  ${formatMMCompact(wallet.moneyMarket)}`);
    }
  });

  return lines.join('\n');
}

export { PORTFOLIO_MAX_LINE_WIDTH };
