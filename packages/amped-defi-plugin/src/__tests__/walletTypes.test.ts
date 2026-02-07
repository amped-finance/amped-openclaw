import {
  normalizeChainId,
  toSodaxChainId,
  SODAX_SUPPORTED_CHAINS,
} from '../wallet/types';

describe('wallet/types chain normalization', () => {
  it('preserves hyper alias for wallet support checks', () => {
    expect(normalizeChainId('hyper')).toBe('hyper');
    expect(toSodaxChainId('hyper')).toBe('hyper');
    expect(SODAX_SUPPORTED_CHAINS).toContain('hyper');
  });

  it('maps hyperevm alias to SDK hyper chain id', () => {
    expect(toSodaxChainId('hyperevm')).toBe('hyper');
  });

  it('maps icon aliases to canonical SDK chain id', () => {
    expect(normalizeChainId('0x1.icon')).toBe('icon');
    expect(toSodaxChainId('icon')).toBe('0x1.icon');
  });

  it('maps injective alias to canonical SDK chain id', () => {
    expect(normalizeChainId('injective-1')).toBe('injective');
    expect(toSodaxChainId('injective')).toBe('injective-1');
  });
});
