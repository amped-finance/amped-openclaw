/**
 * Unified Wallet Manager
 *
 * Provides unified wallet resolution with support for:
 * - Named wallets (user labels like "bankr", "trading", "default")
 * - Multiple wallet backends (Bankr API, local key, skill adapter)
 * - Cross-chain support (EVM + Solana via Bankr)
 *
 * Resolution Priority:
 * 1. Explicit wallet configuration in config.json "wallets" section
 * 2. Bankr backend (if walletBackend: "bankr" is set)
 * 3. Skill adapter (evm-wallet-skill / ~/.evm-wallet.json)
 * 4. AMPED_OC_WALLETS_JSON environment variable
 *
 * @module wallet/walletManager
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Supported chain types for wallet
 */
export type ChainType = 'evm' | 'solana';

/**
 * Wallet source/backend type
 */
export type WalletSource = 'bankr' | 'localKey' | 'skill' | 'env';

/**
 * Wallet execution mode
 */
export type WalletMode = 'execute' | 'prepare';

/**
 * Named wallet configuration in config.json
 */
export interface NamedWalletConfig {
  address?: string;
  source: WalletSource;
  chains?: ChainType[];
  label?: string;
}

/**
 * Full plugin configuration schema
 */
export interface PluginConfig {
  walletBackend?: 'bankr' | 'localKey';
  bankrApiKey?: string;
  bankrApiUrl?: string;
  bankrWalletAddress?: string;
  wallets?: Record<string, NamedWalletConfig>;
  defaultWallet?: string;
}

/**
 * Resolved wallet metadata returned by WalletManager
 */
export interface ResolvedWallet {
  id: string;
  address: string;
  source: WalletSource;
  chains: ChainType[];
  mode: WalletMode;
  privateKey?: string;
  label?: string;
}

export class WalletManager {
  private config: PluginConfig;
  private mode: WalletMode;
  private skillWalletCache: Map<string, { address: string; privateKey?: string }> = new Map();
  private envWalletCache: Map<string, { address: string; privateKey?: string }> = new Map();

  constructor() {
    this.config = this.loadConfig();
    this.mode = (process.env.AMPED_OC_MODE as WalletMode) || 'execute';
    this.loadSkillWallets();
    this.loadEnvWallets();

    console.log('[WalletManager] Initialized', {
      backend: this.config.walletBackend || 'auto',
      defaultWallet: this.config.defaultWallet || 'default',
      namedWallets: Object.keys(this.config.wallets || {}),
      skillWallets: Array.from(this.skillWalletCache.keys()),
      envWallets: Array.from(this.envWalletCache.keys()),
    });
  }

  private loadConfig(): PluginConfig {
    const configPath = join(homedir(), '.openclaw', 'extensions', 'amped-openclaw', 'config.json');

    if (!existsSync(configPath)) {
      console.log('[WalletManager] No config.json found, using defaults');
      return {};
    }

    try {
      const content = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content) as PluginConfig;
      console.log('[WalletManager] Loaded config.json', {
        walletBackend: config.walletBackend,
        hasBankrKey: !!config.bankrApiKey,
        bankrWalletAddress: config.bankrWalletAddress?.slice(0, 10) + '...',
      });
      return config;
    } catch (error) {
      console.warn('[WalletManager] Failed to load config.json:', error);
      return {};
    }
  }

  private loadSkillWallets(): void {
    try {
      const walletPath = join(homedir(), '.evm-wallet.json');

      if (!existsSync(walletPath)) {
        return;
      }

      const content = readFileSync(walletPath, 'utf-8');
      const walletData = JSON.parse(content);

      if (walletData.privateKey) {
        let address = walletData.address;

        if (!address) {
          try {
            const { privateKeyToAccount } = require('viem/accounts');
            const account = privateKeyToAccount(walletData.privateKey as `0x${string}`);
            address = account.address;
          } catch (e) {
            console.warn('[WalletManager] Cannot derive address from private key');
          }
        }

        if (address) {
          this.skillWalletCache.set('skill-default', {
            address,
            privateKey: walletData.privateKey,
          });
          console.log(`[WalletManager] Loaded skill wallet: ${address.slice(0, 10)}...`);
        }
      }
    } catch (error) {
      // Silently ignore
    }
  }

  private loadEnvWallets(): void {
    const walletsJson = process.env.AMPED_OC_WALLETS_JSON;

    if (!walletsJson) {
      return;
    }

    try {
      const wallets = JSON.parse(walletsJson) as Record<string, { address: string; privateKey?: string }>;

      for (const [id, config] of Object.entries(wallets)) {
        this.envWalletCache.set(id, {
          address: config.address,
          privateKey: config.privateKey,
        });
      }

      console.log(`[WalletManager] Loaded ${this.envWalletCache.size} wallet(s) from AMPED_OC_WALLETS_JSON`);
    } catch (error) {
      console.warn('[WalletManager] Failed to parse AMPED_OC_WALLETS_JSON:', error);
    }
  }

  async resolve(walletId?: string): Promise<ResolvedWallet | null> {
    const id = walletId || 'default';

    console.log(`[WalletManager] Resolving wallet: ${id}`);

    // 1. Check explicit named wallet configuration
    const namedWallet = this.config.wallets?.[id];
    if (namedWallet) {
      return this.resolveNamedWallet(id, namedWallet);
    }

    // 2. Special handling for "bankr" ID
    if (id === 'bankr') {
      const bankrWallet = this.resolveBankrWallet();
      if (bankrWallet) return bankrWallet;
    }

    // 3. Special handling for "default"
    if (id === 'default') {
      return this.resolveDefaultWallet();
    }

    // 4. Check env wallets
    const envWallet = this.envWalletCache.get(id);
    if (envWallet) {
      return {
        id,
        address: envWallet.address,
        source: 'env',
        chains: ['evm'],
        mode: this.mode,
        privateKey: envWallet.privateKey,
      };
    }

    // 5. Check skill wallets
    const skillWallet = this.skillWalletCache.get(id) || this.skillWalletCache.get(`skill-${id}`);
    if (skillWallet) {
      return {
        id,
        address: skillWallet.address,
        source: 'skill',
        chains: ['evm'],
        mode: this.mode,
        privateKey: skillWallet.privateKey,
      };
    }

    console.warn(`[WalletManager] Wallet not found: ${id}`);
    return null;
  }

  private async resolveDefaultWallet(): Promise<ResolvedWallet | null> {
    const defaultId = this.config.defaultWallet;

    if (defaultId && defaultId !== 'default') {
      const resolved = await this.resolve(defaultId);
      if (resolved) {
        return { ...resolved, id: 'default' };
      }
    }

    // If walletBackend is "bankr", default to Bankr wallet
    if (this.config.walletBackend === 'bankr') {
      const bankrWallet = this.resolveBankrWallet();
      if (bankrWallet) {
        return { ...bankrWallet, id: 'default' };
      }
    }

    // Otherwise, try skill wallet
    const skillWallet = this.skillWalletCache.get('skill-default');
    if (skillWallet) {
      return {
        id: 'default',
        address: skillWallet.address,
        source: 'skill',
        chains: ['evm'],
        mode: this.mode,
        privateKey: skillWallet.privateKey,
      };
    }

    // Try first env wallet
    const firstEnvWallet = Array.from(this.envWalletCache.entries())[0];
    if (firstEnvWallet) {
      return {
        id: 'default',
        address: firstEnvWallet[1].address,
        source: 'env',
        chains: ['evm'],
        mode: this.mode,
        privateKey: firstEnvWallet[1].privateKey,
      };
    }

    console.warn('[WalletManager] No default wallet found');
    return null;
  }

  private resolveBankrWallet(): ResolvedWallet | null {
    if (!this.config.bankrWalletAddress || !this.config.bankrApiKey) {
      return null;
    }

    return {
      id: 'bankr',
      address: this.config.bankrWalletAddress,
      source: 'bankr',
      chains: ['evm', 'solana'],
      mode: this.mode,
      label: 'Bankr Managed Wallet',
    };
  }

  private async resolveNamedWallet(id: string, config: NamedWalletConfig): Promise<ResolvedWallet | null> {
    let address = config.address;
    let privateKey: string | undefined;

    switch (config.source) {
      case 'bankr':
        address = address || this.config.bankrWalletAddress;
        if (!address) {
          console.warn(`[WalletManager] Named wallet "${id}" uses bankr source but no address configured`);
          return null;
        }
        break;

      case 'skill':
        const skillWallet = this.skillWalletCache.get('skill-default');
        if (!skillWallet) {
          console.warn(`[WalletManager] Named wallet "${id}" uses skill source but no skill wallet found`);
          return null;
        }
        address = address || skillWallet.address;
        privateKey = skillWallet.privateKey;
        break;

      case 'localKey':
      case 'env':
        const envWallet = this.envWalletCache.get(id);
        if (envWallet) {
          address = address || envWallet.address;
          privateKey = envWallet.privateKey;
        }
        break;
    }

    if (!address) {
      console.warn(`[WalletManager] Cannot resolve address for named wallet "${id}"`);
      return null;
    }

    return {
      id,
      address,
      source: config.source,
      chains: config.chains || ['evm'],
      mode: this.mode,
      privateKey,
      label: config.label,
    };
  }

  getAvailableWalletIds(): string[] {
    const ids = new Set<string>();

    if (this.config.wallets) {
      Object.keys(this.config.wallets).forEach(id => ids.add(id));
    }

    if (this.config.bankrWalletAddress && this.config.bankrApiKey) {
      ids.add('bankr');
    }

    this.envWalletCache.forEach((_, id) => ids.add(id));

    if (this.skillWalletCache.has('skill-default') && !ids.has('default')) {
      ids.add('default');
    }

    return Array.from(ids);
  }

  getBackend(): 'bankr' | 'localKey' {
    return this.config.walletBackend || 'localKey';
  }

  isBankrConfigured(): boolean {
    return !!this.config.bankrApiKey && !!this.config.bankrWalletAddress;
  }

  getBankrConfig(): { apiKey: string; apiUrl: string; walletAddress: string } | null {
    if (!this.isBankrConfigured()) {
      return null;
    }

    return {
      apiKey: this.config.bankrApiKey!,
      apiUrl: this.config.bankrApiUrl || 'https://api.bankr.bot',
      walletAddress: this.config.bankrWalletAddress!,
    };
  }

  reload(): void {
    this.config = this.loadConfig();
    this.skillWalletCache.clear();
    this.envWalletCache.clear();
    this.loadSkillWallets();
    this.loadEnvWallets();
    console.log('[WalletManager] Configuration reloaded');
  }
}

let walletManagerInstance: WalletManager | null = null;

export function getWalletManager(): WalletManager {
  if (!walletManagerInstance) {
    walletManagerInstance = new WalletManager();
  }
  return walletManagerInstance;
}

export function resetWalletManager(): void {
  walletManagerInstance = null;
}
