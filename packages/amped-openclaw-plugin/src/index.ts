/**
 * Amped OpenClaw Plugin
 * 
 * OpenClaw plugin for DeFi operations (swaps, bridging, money market)
 * via the SODAX SDK.
 */

import { AgentTools } from './types';
import { SodaxClient } from './sodax/client';
import { getSpokeProvider, getCacheStats, clearProviderCache } from './providers/spokeProviderFactory';
import { PolicyEngine } from './policy/policyEngine';
import { getWalletRegistry } from './wallet/walletRegistry';

// Tool registrations
import { registerSwapTools } from './tools/swap';
import { registerBridgeTools } from './tools/bridge';
import { registerMoneyMarketTools } from './tools/moneyMarket';
import { registerDiscoveryTools } from './tools/discovery';

/**
 * Plugin activation function - called by OpenClaw on plugin load
 */
export async function activate(agentTools: AgentTools): Promise<void> {
  console.log('[AmpedOpenClaw] Activating plugin...');
  
  // Log environment info (safely)
  const mode = process.env.AMPED_OC_MODE || 'execute';
  const dynamicConfig = process.env.AMPED_OC_SODAX_DYNAMIC_CONFIG === 'true';
  
  console.log(`[AmpedOpenClaw] Mode: ${mode}`);
  console.log(`[AmpedOpenClaw] Dynamic config: ${dynamicConfig}`);
  
  // Validate required environment variables
  validateEnvironment();
  
  // Initialize core components
  try {
    // Initialize SODAX SDK client (singleton)
    const sodaxClient = await SodaxClient.getClient();
    console.log('[AmpedOpenClaw] SODAX client initialized');
    
    // Initialize spoke provider factory
    const cacheStats = getCacheStats();
    console.log(`[AmpedOpenClaw] Spoke provider factory ready (${cacheStats.size} cached providers)`);
    
    // Initialize policy engine
    const policyEngine = new PolicyEngine();
    console.log(`[AmpedOpenClaw] Policy engine loaded (${policyEngine.getAvailablePolicies().length} policies)`);
    
    // Initialize wallet registry
    const walletRegistry = getWalletRegistry();
    console.log(`[AmpedOpenClaw] Wallet registry loaded (${walletRegistry.getWalletIds().length} wallets)`);
    
  } catch (error) {
    console.error('[AmpedOpenClaw] Failed to initialize core components:', error);
    throw new Error(`Plugin initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  // Register all tools
  console.log('[AmpedOpenClaw] Registering tools...');
  
  registerDiscoveryTools(agentTools);
  console.log('[AmpedOpenClaw] ✓ Discovery tools registered');
  
  registerSwapTools(agentTools);
  console.log('[AmpedOpenClaw] ✓ Swap tools registered');
  
  registerBridgeTools(agentTools);
  console.log('[AmpedOpenClaw] ✓ Bridge tools registered');
  
  registerMoneyMarketTools(agentTools);
  console.log('[AmpedOpenClaw] ✓ Money market tools registered');
  
  console.log('[AmpedOpenClaw] Plugin activated successfully');
  console.log('[AmpedOpenClaw] Available tools:');
  console.log('  Discovery:');
  console.log('    - amped_oc_supported_chains');
  console.log('    - amped_oc_supported_tokens');
  console.log('    - amped_oc_wallet_address');
  console.log('    - amped_oc_money_market_reserves');
  console.log('    - amped_oc_money_market_positions (single chain)');
  console.log('    - amped_oc_cross_chain_positions (aggregated view)');
  console.log('    - amped_oc_user_intents (API query)');
  console.log('  Swap:');
  console.log('    - amped_oc_swap_quote');
  console.log('    - amped_oc_swap_execute');
  console.log('    - amped_oc_swap_status');
  console.log('    - amped_oc_swap_cancel');
  console.log('  Bridge:');
  console.log('    - amped_oc_bridge_discover');
  console.log('    - amped_oc_bridge_quote');
  console.log('    - amped_oc_bridge_execute');
  console.log('  Money Market:');
  console.log('    - amped_oc_mm_supply');
  console.log('    - amped_oc_mm_withdraw');
  console.log('    - amped_oc_mm_borrow (cross-chain capable)');
  console.log('    - amped_oc_mm_repay');
}

/**
 * Validate required environment variables
 */
function validateEnvironment(): void {
  const requiredVars: string[] = [];
  
  // Wallets are required
  if (!process.env.AMPED_OC_WALLETS_JSON) {
    requiredVars.push('AMPED_OC_WALLETS_JSON');
  }
  
  // RPC URLs are required for execution mode
  const mode = process.env.AMPED_OC_MODE || 'execute';
  if (mode === 'execute' && !process.env.AMPED_OC_RPC_URLS_JSON) {
    requiredVars.push('AMPED_OC_RPC_URLS_JSON');
  }
  
  if (requiredVars.length > 0) {
    console.warn(`[AmpedOpenClaw] Missing environment variables: ${requiredVars.join(', ')}`);
    console.warn('[AmpedOpenClaw] Some features may not work correctly');
  }
}

/**
 * Plugin deactivation - cleanup
 */
export async function deactivate(): Promise<void> {
  console.log('[AmpedOpenClaw] Deactivating plugin...');
  
  // Reset singletons
  SodaxClient.reset();
  
  console.log('[AmpedOpenClaw] Plugin deactivated');
}

/**
 * Get plugin version
 */
export function getVersion(): string {
  return '1.0.0';
}

/**
 * Get plugin info
 */
export function getPluginInfo(): {
  name: string;
  version: string;
  description: string;
  author: string;
} {
  return {
    name: 'Amped OpenClaw',
    version: '1.0.0',
    description: 'DeFi operations plugin for swaps, bridging, and money market via SODAX SDK',
    author: 'Amped Finance'
  };
}

// Re-export types and utilities for external use
export * from './types';
export { SodaxClient } from './sodax/client';
export { getSpokeProvider, getCacheStats, clearProviderCache, SpokeProvider } from './providers/spokeProviderFactory';
export { PolicyEngine } from './policy/policyEngine';
export { WalletRegistry, getWalletRegistry } from './wallet/walletRegistry';

// Default export for OpenClaw
export default { activate, deactivate, getVersion, getPluginInfo };
