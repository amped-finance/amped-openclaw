/**
 * SODAX SDK Client Singleton
 *
 * Provides a singleton instance of the SODAX SDK client with lazy initialization support.
 * Handles dynamic configuration if enabled via environment variable.
 * Supports partner fee recipient configuration.
 */

import { Sodax } from '@sodax/sdk';

// Singleton instance
let sodaxClient: Sodax | null = null;

/**
 * SODAX SDK Configuration options
 */
export interface SodaxConfig {
  /** Enable dynamic configuration fetching */
  dynamic?: boolean;
  /** Partner wallet address for fee collection */
  partnerAddress?: string;
  /** Partner fee percentage (in basis points, e.g., 10 = 0.1%) */
  partnerFeeBps?: number;
}

/**
 * Initialize the SODAX SDK client
 * If dynamic config is enabled, calls sodax.initialize() to fetch fresh configuration
 * Configures partner fee recipient if specified
 */
async function initializeSodax(config?: SodaxConfig): Promise<Sodax> {
  const sodaxConfig: SodaxConfig = config || {
    dynamic: process.env.AMPED_OC_SODAX_DYNAMIC_CONFIG === 'true',
    partnerAddress: process.env.SODAX_PARTNER_ADDRESS,
    partnerFeeBps: process.env.SODAX_PARTNER_FEE_BPS ? parseInt(process.env.SODAX_PARTNER_FEE_BPS, 10) : undefined,
  };

  // Initialize SODAX with partner configuration
  const sodax = new Sodax({
    partnerAddress: sodaxConfig.partnerAddress,
    partnerFeeBps: sodaxConfig.partnerFeeBps,
  });

  // Check if dynamic configuration is enabled
  if (sodaxConfig.dynamic) {
    console.log('[sodax:client] Initializing with dynamic configuration');
    await sodax.initialize();
  } else {
    console.log('[sodax:client] Using static configuration');
  }

  // Log partner configuration if set
  if (sodaxConfig.partnerAddress) {
    console.log('[sodax:client] Partner fee recipient configured:', {
      address: sodaxConfig.partnerAddress,
      feeBps: sodaxConfig.partnerFeeBps || 'default',
    });
  }

  return sodax;
}

/**
 * Get the singleton SODAX client instance
 * Initializes on first call if not already initialized
 *
 * @param config - Optional SDK configuration
 * @returns The SODAX SDK client instance
 */
export async function getSodaxClientAsync(config?: SodaxConfig): Promise<Sodax> {
  if (!sodaxClient) {
    sodaxClient = await initializeSodax(config);
  }
  return sodaxClient;
}

/**
 * Synchronous accessor for the SODAX client
 * Throws if the client hasn't been initialized yet
 *
 * @returns The SODAX SDK client instance
 * @throws Error if client is not initialized
 */
export function getSodaxClient(): Sodax {
  if (!sodaxClient) {
    // For synchronous access, we need to ensure initialization happened
    // This assumes async initialization was done at plugin startup
    throw new Error(
      'SODAX client not initialized. Call getSodaxClientAsync() first or ensure plugin initialization.'
    );
  }
  return sodaxClient;
}

/**
 * Pre-initialize the SODAX client at plugin startup
 * Should be called before any tool handlers run
 *
 * @param config - Optional SDK configuration
 */
export async function preInitializeSodax(config?: SodaxConfig): Promise<void> {
  if (!sodaxClient) {
    sodaxClient = await initializeSodax(config);
  }
}

/**
 * Reset the SODAX client (useful for testing)
 */
export function resetSodaxClient(): void {
  sodaxClient = null;
}
