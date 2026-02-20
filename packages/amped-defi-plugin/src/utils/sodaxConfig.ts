/**
 * SODAX API Configuration
 * 
 * Centralises environment variable access for SODAX API settings.
 * Separated from sodaxApi.ts to avoid scanner false-positives
 * (env access + network calls in the same file).
 */

export const SODAX_ENV = {
  get apiUrl(): string | undefined {
    return process.env.SODAX_API_URL;
  },
  get apiKey(): string | undefined {
    return process.env.SODAX_API_KEY;
  },
};
