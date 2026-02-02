/**
 * SODAX SDK Client Singleton
 *
 * Provides a singleton instance of the SODAX SDK client with lazy initialization support.
 * Handles dynamic configuration if enabled via environment variable.
 */

import { Sodax } from '@sodax/sdk';

// Singleton instance
let sodaxClient: Sodax | null = null;

/**
 * Initialize the SODAX SDK client
 * If dynamic config is enabled, calls sodax.initialize() to fetch fresh configuration
 */
async function initializeSodax(): Promise<Sodax> {
  const sodax = new Sodax();

  // Check if dynamic configuration is enabled
  const useDynamicConfig = process.env.AMPED_OC_SODAX_DYNAMIC_CONFIG === 'true';

  if (useDynamicConfig) {
    console.log('[sodax:client] Initializing with dynamic configuration');
    await sodax.initialize();
  } else {
    console.log('[sodax:client] Using static configuration');
  }

  return sodax;
}

/**
 * Get the singleton SODAX client instance
 * Initializes on first call if not already initialized
 *
 * @returns The SODAX SDK client instance
 */
export async function getSodaxClientAsync(): Promise<Sodax> {
  if (!sodaxClient) {
    sodaxClient = await initializeSodax();
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
 */
export async function preInitializeSodax(): Promise<void> {
  if (!sodaxClient) {
    sodaxClient = await initializeSodax();
  }
}

/**
 * Reset the SODAX client (useful for testing)
 */
export function resetSodaxClient(): void {
  sodaxClient = null;
}
