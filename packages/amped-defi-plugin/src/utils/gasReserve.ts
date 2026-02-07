/**
 * Gas reserve protection for native token operations
 * Prevents users from bridging/swapping their entire native token balance
 * and being unable to pay for future transactions.
 */

import { parseUnits } from 'viem';

// Minimum gas reserves per chain (in native token units)
const GAS_RESERVES: Record<string, string> = {
  ethereum: '0.005',      // ~$10-15 at current prices
  base: '0.002',          // ~$4-6
  arbitrum: '0.002',      // ~$4-6
  optimism: '0.002',      // ~$4-6
  polygon: '5',           // ~$0.50 (POL is cheaper)
  sonic: '10',            // ~$0.50 (S is cheap)
  lightlink: '0.002',     // ~$4-6
  bsc: '0.005',           // ~$3-5 (BNB)
  avalanche: '0.1',       // ~$3-5 (AVAX)
  solana: '0.01',         // ~$0.60 (SOL)
};

/**
 * Get the minimum gas reserve for a chain
 */
export function getGasReserve(chainId: string): bigint {
  const chain = chainId.toLowerCase();
  const reserveStr = GAS_RESERVES[chain];
  
  if (!reserveStr) {
    // Default to 0.002 ETH equivalent for unknown chains
    return parseUnits('0.002', 18);
  }
  
  return parseUnits(reserveStr, 18);
}

/**
 * Check if a swap/bridge would leave enough gas
 * @param currentBalance - Current native token balance (bigint)
 * @param amountToSend - Amount user wants to send (bigint)
 * @param chainId - Source chain ID
 * @returns { safe: boolean, reserve: bigint, availableToSend: bigint }
 */
export function checkGasReserve(currentBalance: bigint, amountToSend: bigint, chainId: string): {
  safe: boolean;
  reserve: bigint;
  availableToSend: bigint;
  message?: string;
} {
  const reserve = getGasReserve(chainId);
  const availableToSend = currentBalance > reserve ? currentBalance - reserve : 0n;
  
  if (amountToSend > availableToSend) {
    return {
      safe: false,
      reserve,
      availableToSend,
      message: `Insufficient balance: trying to send ${amountToSend}, but need to keep ${reserve} for gas. Available to send: ${availableToSend}`
    };
  }
  
  return {
    safe: true,
    reserve,
    availableToSend
  };
}

/**
 * Format gas reserve warning message for user
 */
export function formatGasReserveWarning(chainId: string, currentBalance: string, attemptedAmount: string): string {
  const chain = chainId.toLowerCase();
  const reserveStr = GAS_RESERVES[chain] || '0.002';
  
  return `⚠️ Gas Reserve Protection: Cannot send ${attemptedAmount} - must keep ${reserveStr} native tokens for gas on ${chainId}. Current balance: ${currentBalance}`;
}
