export interface TxTrackingLink {
  txHash: string;
  chainId?: string;
  explorerUrl?: string;
  sodaxScanUrl: string;
}

export interface IntentTrackingLink {
  intentHash: string;
  sodaxScanUrl: string;
  apiUrl: string;
}

export interface TransactionTracking {
  sourceTx?: TxTrackingLink;
  hubTx?: TxTrackingLink;
  destinationTx?: TxTrackingLink;
  intent?: IntentTrackingLink;
}

const SODAX_CANARY_API = 'https://canary-api.sodax.com/v1/be';

const CHAIN_EXPLORERS: Record<string, string> = {
  ethereum: 'https://etherscan.io/tx/',
  base: 'https://basescan.org/tx/',
  arbitrum: 'https://arbiscan.io/tx/',
  optimism: 'https://optimistic.etherscan.io/tx/',
  polygon: 'https://polygonscan.com/tx/',
  sonic: 'https://sonicscan.org/tx/',
  avalanche: 'https://snowtrace.io/tx/',
  bsc: 'https://bscscan.com/tx/',
  solana: 'https://solscan.io/tx/',
};

const SODAX_CHAIN_ID_TO_ALIAS: Record<string, string> = {
  '1': 'solana',
  '10': 'optimism',
  '30': 'base',
  '56': 'bsc',
  '137': 'polygon',
  '146': 'sonic',
  '42161': 'arbitrum',
  '43114': 'avalanche',
};

function normalizeChainId(chainId?: string | number): string | undefined {
  if (chainId === undefined || chainId === null) return undefined;
  const value = String(chainId).replace(/^0x[\da-f]+\./i, '').toLowerCase();
  if (!value) return undefined;
  return SODAX_CHAIN_ID_TO_ALIAS[value] || value;
}

export function getTxExplorerLink(chainId: string | number | undefined, txHash: string): string | undefined {
  const normalized = normalizeChainId(chainId);
  const explorer = normalized ? CHAIN_EXPLORERS[normalized] : undefined;
  return explorer ? `${explorer}${txHash}` : undefined;
}

export function getSodaxMessageSearchUrl(value: string): string {
  return `https://sodaxscan.com/messages/search?value=${value}`;
}

export function getSodaxIntentUrl(intentHash: string): string {
  return `https://sodaxscan.com/intents/${intentHash}`;
}

export function getSodaxIntentApiUrl(intentHash: string): string {
  return `${SODAX_CANARY_API}/intent/${intentHash}`;
}

export function buildTxTrackingLink(
  txHash: string | undefined,
  chainId?: string | number
): TxTrackingLink | undefined {
  if (!txHash) return undefined;
  const normalized = normalizeChainId(chainId);
  return {
    txHash,
    chainId: normalized,
    explorerUrl: getTxExplorerLink(chainId, txHash),
    sodaxScanUrl: getSodaxMessageSearchUrl(txHash),
  };
}

export function buildIntentTrackingLink(intentHash: string | undefined): IntentTrackingLink | undefined {
  if (!intentHash) return undefined;
  return {
    intentHash,
    sodaxScanUrl: getSodaxIntentUrl(intentHash),
    apiUrl: getSodaxIntentApiUrl(intentHash),
  };
}
