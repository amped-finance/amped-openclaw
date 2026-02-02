/**
 * Wallet Registry
 *
 * Manages wallet resolution by walletId.
 * Supports execution mode (with private key) and prepare mode (address-only).
 */

import { WalletConfig } from '../types';

/**
 * Wallet registry entry
 */
interface WalletEntry extends WalletConfig {
  mode: 'execute' | 'prepare';
}

/**
 * Wallet Registry class for resolving wallet configurations
 */
export class WalletRegistry {
  private wallets: Map<string, WalletEntry>;

  constructor() {
    this.wallets = this.loadWallets();
  }

  /**
   * Load wallet configurations from environment
   *
   * @returns Map of walletId to wallet entry
   */
  private loadWallets(): Map<string, WalletEntry> {
    const walletsJson = process.env.AMPED_OC_WALLETS_JSON;
    const mode = (process.env.AMPED_OC_MODE as 'execute' | 'prepare') || 'execute';

    if (!walletsJson) {
      console.warn('[walletRegistry] AMPED_OC_WALLETS_JSON not set');
      return new Map();
    }

    try {
      const walletConfigs = JSON.parse(walletsJson) as Record<string, WalletConfig>;
      const wallets = new Map<string, WalletEntry>();

      for (const [walletId, config] of Object.entries(walletConfigs)) {
        wallets.set(walletId, {
          ...config,
          mode,
        });
      }

      console.log(`[walletRegistry] Loaded ${wallets.size} wallet(s) in ${mode} mode`);
      return wallets;
    } catch (error) {
      console.error('[walletRegistry] Failed to parse AMPED_OC_WALLETS_JSON', error);
      return new Map();
    }
  }

  /**
   * Resolve a wallet by its ID
   *
   * @param walletId - The wallet identifier
   * @returns The wallet configuration or null if not found
   */
  async resolveWallet(walletId: string): Promise<WalletEntry | null> {
    const wallet = this.wallets.get(walletId);

    if (!wallet) {
      console.error(`[walletRegistry] Wallet not found: ${walletId}`);
      return null;
    }

    // In execute mode, validate that private key is present
    if (wallet.mode === 'execute' && !wallet.privateKey) {
      console.error(`[walletRegistry] Wallet ${walletId} missing privateKey in execute mode`);
      return null;
    }

    // Validate address format (basic check)
    if (!wallet.address || !wallet.address.startsWith('0x')) {
      console.error(`[walletRegistry] Wallet ${walletId} has invalid address: ${wallet.address}`);
      return null;
    }

    return wallet;
  }

  /**
   * Get the wallet mode (execute or prepare)
   *
   * @returns The current wallet mode
   */
  getMode(): 'execute' | 'prepare' {
    return (process.env.AMPED_OC_MODE as 'execute' | 'prepare') || 'execute';
  }

  /**
   * Check if running in execute mode
   *
   * @returns True if in execute mode
   */
  isExecuteMode(): boolean {
    return this.getMode() === 'execute';
  }

  /**
   * Check if running in prepare mode
   *
   * @returns True if in prepare mode
   */
  isPrepareMode(): boolean {
    return this.getMode() === 'prepare';
  }

  /**
   * Get all registered wallet IDs
   *
   * @returns Array of wallet IDs
   */
  getWalletIds(): string[] {
    return Array.from(this.wallets.keys());
  }

  /**
   * Get the count of registered wallets
   *
   * @returns Number of wallets
   */
  getWalletCount(): number {
    return this.wallets.size;
  }

  /**
   * Reload wallets from environment (useful for hot-reloading)
   */
  reload(): void {
    this.wallets = this.loadWallets();
  }
}
