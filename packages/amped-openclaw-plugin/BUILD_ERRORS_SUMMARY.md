# Build Errors Summary

## Overview
151 TypeScript errors across 11 files when building against `@sodax/sdk@1.0.4-beta`

## Major Issue Categories

### 1. Missing SDK Exports (Code tries to import things that don't exist)
- `SodaxClient` - SDK exports `Sodax` class, not `SodaxClient`
- `EvmSpokeProvider`, `SonicSpokeProvider` - Not exported from `@sodax/wallet-sdk-core`
- `getWalletRegistry` - We removed this function, but code still imports it
- `sodax` (lowercase), `QuoteRequest`, `Intent`, `SwapQuote`, `IntentStatus` - Not exported

### 2. SDK Returns Result Types (not direct values)
The SDK uses a Result pattern: `{ ok: boolean, value?: T, error?: E }`

Our code expects direct values:
```typescript
// Wrong - we wrote:
const quote = await sodax.swaps.getQuote(request);
quote.inputAmount  // ERROR: 'inputAmount' doesn't exist on Result type

// Correct - SDK returns:
const result = await sodax.swaps.getQuote(request);
if (result.ok) {
  result.value.inputAmount  // Access via .value
}
```

### 3. Function Signature Mismatches

| Our Code | SDK Actual |
|----------|------------|
| `getBridgeableTokens({ srcChainId, dstChainId, srcToken })` | `getBridgeableTokens(from, to, token)` |
| `sodax.bridge.bridge({ srcChainId, dstChainId, ... })` | Different params |
| `getSupportedSpokeChains()` returns objects with `.id` | Returns string literals |

### 4. Partner Configuration
```typescript
// Our code tries:
new Sodax({ partnerAddress, partnerFeeBps })
// ERROR: 'partnerAddress' does not exist in type 'SodaxConfig'
```

## Recommendation

The implementation was based on assumed SDK APIs. We need to either:

1. **Get the actual SDK type definitions** and rewrite all tool handlers to match
2. **Use a simpler approach** - stub/mock the SDK calls for now
3. **Remove type checking** (`skipLibCheck: true` and use `any` types temporarily)

## Quick Fix for Testing

Add to `tsconfig.json`:
```json
{
  "compilerOptions": {
    "skipLibCheck": true,
    "noImplicitAny": false
  }
}
```

Then cast SDK calls to `any`:
```typescript
const result = await (sodax.swaps.getQuote(request) as any);
```
