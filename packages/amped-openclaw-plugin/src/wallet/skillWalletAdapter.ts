/**
 * EVM Wallet Skill Adapter
 * 
 * Integrates with the evm-wallet-skill to reuse existing wallet configuration
 * instead of requiring custom AMPED_OC_WALLETS_JSON.
 * 
 * This allows users to:
 * - Use existing wallet setup from evm-wallet-skill
 * - Support multiple wallet types (private key, KMS, hardware)
 * - Leverage existing RPC configuration
 * 
 * @see https://github.com/surfer77/evm-wallet-skill
 */

import { ErrorCode, AmpedOpenClawError } from '../utils/errors';

/**
 * Wallet information from evm-wallet-skill
 */
export interface EvmWalletInfo {
  id: string;
  address: string;
  chainId?: number;
  provider?: 'privateKey' | 'kms' | 'hardware' | 'web3Auth';
}

/**
 * Wallet adapter options
 */
export interface WalletAdapterOptions {
  preferSkill?: boolean;
  walletId?: string;
}

/**
 * EVM Wallet Skill Adapter
 */
export class EvmWalletSkillAdapter {
  private skillWallets: Map<string, EvmWalletInfo> = new Map();
  private skillRpcs: Map<string, string> = new Map();
  private useSkill: boolean;

  constructor(options: WalletAdapterOptions = {}) {
    this.useSkill = options.preferSkill !== false;
    if (this.useSkill) {
      this.loadSkillConfig();
    }
  }

  /**
   * Load configuration from evm-wallet-skill environment variables
   */
  private loadSkillConfig(): void {
    try {
      // Try evm-wallet-skill config formats
      const skillWalletsJson = process.env.EVM_WALLETS_JSON || process.env.WALLET_CONFIG_JSON;
      const skillRpcsJson = process.env.EVM_RPC_URLS_JSON || process.env.RPC_URLS_JSON;

      if (skillWalletsJson) {
        const wallets = JSON.parse(skillWalletsJson);
        
        if (Array.isArray(wallets)) {
          wallets.forEach(w => {
            this.skillWallets.set(w.id || w.name || 'default', {
              id: w.id || w.name || 'default',
              address: w.address,
              chainId: w.chainId,
              provider: w.provider || w.type,
            });
          });
        } else if (typeof wallets === 'object') {
          Object.entries(wallets).forEach(([id, config]: [string, any]) => {
            this.skillWallets.set(id, {
              id,
              address: config.address,
              chainId: config.chainId,
              provider: config.provider || 'privateKey',
            });
          });
        }

        console.log(`[walletAdapter] Loaded ${this.skillWallets.size} wallets from evm-wallet-skill`);
      }

      if (skillRpcsJson) {
        const rpcs = JSON.parse(skillRpcsJson);
        Object.entries(rpcs).forEach(([chain, url]) => {
          this.skillRpcs.set(String(chain).toLowerCase(), url as string);
        });
        console.log(`[walletAdapter] Loaded ${this.skillRpcs.size} RPC URLs from evm-wallet-skill`);
      }
    } catch (error) {
      console.warn('[walletAdapter] Failed to load evm-wallet-skill config:', error);
    }
  }

  /**
   * Get wallet address - tries skill first, then legacy config
   */
  async getWalletAddress(walletId?: string): Promise<string> {
    // Try skill wallets
    if (this.skillWallets.size > 0) {
      const wallet = this.skillWallets.get(walletId || 'default') || 
                     Array.from(this.skillWallets.values())[0];
      if (wallet) return wallet.address;
    }

    // Fallback to AMPED_OC_WALLETS_JSON
    const legacy = process.env.AMPED_OC_WALLETS_JSON;
    if (legacy) {
      const config = JSON.parse(legacy);
      const wallet = config[walletId || 'main'] || config.default || Object.values(config)[0];
      if (wallet?.address) return wallet.address;
    }

    throw new AmpedOpenClawError(
      ErrorCode.WALLET_NOT_FOUND,
      `Wallet not found: ${walletId || 'default'}`,
      { remediation: 'Configure EVM_WALLETS_JSON or AMPED_OC_WALLETS_JSON' }
    );
  }

  /**
   * Get RPC URL - tries skill first, then legacy config
   */
  async getRpcUrl(chainId: string | number): Promise<string> {
    const key = String(chainId).toLowerCase();

    // Try skill RPCs
    if (this.skillRpcs.has(key)) {
      return this.skillRpcs.get(key)!;
    }

    // Fallback to AMPED_OC_RPC_URLS_JSON
    const legacy = process.env.AMPED_OC_RPC_URLS_JSON;
    if (legacy) {
      const config = JSON.parse(legacy);
      if (config[key] || config[chainId]) return config[key] || config[chainId];
    }

    throw new AmpedOpenClawError(
      ErrorCode.RPC_URL_NOT_CONFIGURED,
      `RPC URL not configured for chain: ${chainId}`,
      { remediation: 'Configure EVM_RPC_URLS_JSON or AMPED_OC_RPC_URLS_JSON' }
    );
  }

  /**
   * Check if using skill wallets
   */
  isUsingSkillWallets(): boolean {
    return this.skillWallets.size > 0;
  }

  /**
   * Check if using skill RPCs
   */
  isUsingSkillRpcs(): boolean {
    return this.skillRpcs.size > 0;
  }
}

// Singleton
let adapter: EvmWalletSkillAdapter | null = null;

export function getWalletAdapter(options?: WalletAdapterOptions): EvmWalletSkillAdapter {
  if (!adapter) {
    adapter = new EvmWalletSkillAdapter(options);
  }
  return adapter;
}

export function resetWalletAdapter(): void {
  adapter = null;
}
