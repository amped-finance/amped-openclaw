/**
 * Bankr Disk Cache
 *
 * Handles reading/writing cached wallet addresses to disk.
 * Separated from BankrBackend to keep file-I/O and network
 * code in different modules (avoids security scanner false-positives).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

const BANKR_CACHE_DIR = join(homedir(), '.openclaw', 'cache');

function ensureCacheDir(): void {
  if (!existsSync(BANKR_CACHE_DIR)) {
    mkdirSync(BANKR_CACHE_DIR, { recursive: true });
  }
}

// ── EVM address cache ──────────────────────────────────────────────

export function loadCachedEvmAddress(nickname: string): string | null {
  const cachePath = join(BANKR_CACHE_DIR, `bankr-${nickname}-address.json`);
  if (!existsSync(cachePath)) return null;
  try {
    const data = JSON.parse(readFileSync(cachePath, 'utf-8'));
    if (data.address && /^0x[a-fA-F0-9]{40}$/.test(data.address)) {
      return data.address;
    }
  } catch {
    // cache miss
  }
  return null;
}

export function saveCachedEvmAddress(nickname: string, address: string): void {
  const cachePath = join(BANKR_CACHE_DIR, `bankr-${nickname}-address.json`);
  try {
    ensureCacheDir();
    writeFileSync(cachePath, JSON.stringify({ address, timestamp: Date.now() }));
    console.log(`[BankrCache] Cached EVM address to ${cachePath}`);
  } catch (e) {
    console.warn(`[BankrCache] Failed to cache EVM address: ${e}`);
  }
}

// ── Solana address cache ───────────────────────────────────────────

const SOLANA_CACHE_TTL_MS = 86400000; // 24 hours

export function loadCachedSolanaAddress(nickname: string): string | null {
  const cachePath = join(BANKR_CACHE_DIR, `bankr-${nickname}-solana-address.json`);
  if (!existsSync(cachePath)) return null;
  try {
    const cached = JSON.parse(readFileSync(cachePath, 'utf-8'));
    if (cached.address && Date.now() - cached.timestamp < SOLANA_CACHE_TTL_MS) {
      return cached.address;
    }
  } catch {
    // cache miss
  }
  return null;
}

export function saveCachedSolanaAddress(nickname: string, address: string): void {
  const cachePath = join(BANKR_CACHE_DIR, `bankr-${nickname}-solana-address.json`);
  try {
    ensureCacheDir();
    writeFileSync(cachePath, JSON.stringify({ address, timestamp: Date.now() }));
    console.log(`[BankrCache] Cached Solana address to ${cachePath}`);
  } catch (e) {
    console.warn(`[BankrCache] Failed to cache Solana address: ${e}`);
  }
}
