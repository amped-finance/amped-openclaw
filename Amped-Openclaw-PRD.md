I’ll draft a PRD for **Amped OpenClaw** that defines the user stories, architecture, security model (per-agent keys, approvals), and the exact skill/tool interfaces needed to support swaps, bridging, and money-market supply/borrow via the SODAX SDKs. I’ll also quickly browse the SODAX package docs to ground the PRD in real APIs and constraints.


## PRD — Amped OpenClaw

### 1) Overview

**Project name:** Amped OpenClaw
**Type:** OpenClaw plugin + skill pack
**Purpose:** Provide a first-class on-chain “DeFi operations” skill/plugin for agents: **swap**, **bridge**, and **money market supply/borrow/repay/withdraw** using the **SODAX SDK** modules (swaps, bridge, money market). ([docs.sodax.com][1])

This PRD is written so you can hand it to a coding agent to implement the plugin + skill instructions end-to-end.

---

### 2) Background & Motivation

OpenClaw agents today typically use ad-hoc wallet skills (e.g., “bankr”, EVM wallet skill, Solana wallet skill). You want a single, consistent skill/plugin that:

* uses SODAX’s **cross-chain intent swap flow** (quotes + intents + solver/relayer),
* supports **token bridging** (spoke↔spoke and spoke↔hub),
* supports **cross-chain money market actions** via the hub chain, with proper allowance/approval handling,
* works safely with **per-agent private keys** (segregated), plus optional **raw-transaction preparation** for “sign elsewhere” flows.

SODAX SDK explicitly exposes these modules and methods: `sodax.swaps.*`, `sodax.bridge.*`, `sodax.moneyMarket.*`. ([docs.sodax.com][2])

---

### 3) Goals / Non-goals

#### Goals (MVP)

1. **Swap**

   * Quote: exact-in + exact-out quotes via `sodax.swaps.getQuote`.
   * Execute: “one-call” swap via `sodax.swaps.swap` when the agent has signing capability.
   * Status: poll intent status and/or fetch intent details.
   * Cancel: cancel active intents where supported.

2. **Bridge**

   * Discover: `getBridgeableTokens`, `isBridgeable`, `getBridgeableAmount`.
   * Execute: `sodax.bridge.bridge`.
   * Allowance + approval flow for EVM spoke chains.

3. **Money market**

   * Supply / Withdraw / Borrow / Repay via `sodax.moneyMarket.*`.
   * Positions/reserves read: `sodax.moneyMarket.data.*` humanized views.
   * Allowance + approval flow.

4. **Security + Controls**

   * Per-agent key segregation (no shared signing state).
   * Spend limits, allowlists, slippage caps, and “simulation on by default” controls for swaps.

5. **OpenClaw-native packaging**

   * Ship **tools** via an OpenClaw plugin (TypeScript).
   * Ship **skills** (`SKILL.md`) via plugin `openclaw.plugin.json` `skills` directories. ([OpenClaw][3])

#### Non-goals (for MVP)

* UI / React integration (ignore `@sodax/wallet-sdk-react`).
* Supporting every non-EVM chain type (Sui/Stellar/Solana/etc.) in v1; design should be extensible, but MVP focuses on EVM + Sonic hub flow.
* Building a full portfolio accounting system (only minimal balances/positions/reserves needed for safe ops).

---

### 4) Key Technical Constraints to Respect

1. **Sonic is a special case**

   * SODAX docs note Sonic (hub chain) must use `SonicSpokeProvider` rather than `EvmSpokeProvider`, because it is the hub chain and requires special handling. ([docs.sodax.com][4])

2. **Dynamic vs static config**

   * If you want dynamic (backend API based) token/chain config, you must call `await sodax.initialize()`; otherwise the SDK uses the static config shipped with the SDK version. ([docs.sodax.com][2])

3. **Raw spoke providers for “prepare tx” mode**

   * SODAX supports “raw spoke providers” (read-only address-only) to generate raw unsigned transactions (useful for server-side preparation and external signing). ([docs.sodax.com][4])
   * However, SODAX notes some “full execution” methods do not support raw mode (e.g., `swap`/`createAndSubmitIntent`), so raw mode requires a multi-step flow. ([docs.sodax.com][2])

4. **OpenClaw skills & secret injection**

   * Skills are directories containing `SKILL.md` with YAML frontmatter, and OpenClaw supports per-skill env injection via config (`skills.entries.<name>.env/apiKey`), with important sandbox caveats. ([OpenClaw][3])

5. **OpenClaw plugin tools**

   * Tools are registered in a plugin via `agentTools.register({ name, summary, schema, handler })` using TypeBox schemas. ([docs.sodax.com][5])
   * Plugin metadata/config lives in `openclaw.plugin.json`. ([docs.sodax.com][6])

---

### 5) Personas & Primary User Stories

#### Personas

* **Agent Operator (you/devops):** installs plugin, configures RPCs/keys/limits, monitors logs.
* **Agent Developer:** writes prompts/workflows using the skill.
* **OpenClaw Agent:** calls tools for swaps/bridges/money-market actions under constraints.

#### MVP User Stories

1. *Swap quote → swap execute*
   “As an agent, I can request an exact-in quote and execute it if slippage and spend limits are satisfied.”

2. *Bridge token A from chain X to chain Y*
   “As an agent, I can confirm bridgeability, check max bridgeable amount, approve if needed, and execute the bridge.”

3. *Supply to money market & monitor positions*
   “As an agent, I can supply USDC on chain X into the money market, then read updated positions in a humanized format.”

4. *Borrow + repay loop*
   “As an agent, I can borrow an asset (within caps), then later repay, and verify health/position updates.”

5. *Prepare-only mode (optional MVP “toggle”)*
   “As an agent, I can request raw unsigned tx payload(s) for signing elsewhere (e.g., on-device signing), then submit hashes to continue the flow.”

---

### 6) Solution Design

#### 6.1 High-level Architecture

**Amped OpenClaw plugin** provides OpenClaw tools that wrap SODAX SDK:

* A singleton `Sodax` client (per process) with lazy `initialize()` support.

* A `SpokeProviderFactory` that creates/caches spoke providers per `(walletId, chainId)`:

  * `EvmSpokeProvider` for EVM spoke chains
  * `SonicSpokeProvider` for Sonic hub chain ([docs.sodax.com][4])

* A `PolicyEngine` enforcing:

  * max spend per tx/day,
  * allowed chain IDs,
  * allowed tokens/contracts,
  * max slippage bps,
  * (optional) require simulation and block “skipSimulation”.

* A `WalletRegistry` that resolves a wallet by `walletId`:

  * **Execution mode:** wallet has signing capability (private key in env, or integrated wallet skill adapter).
  * **Prepare mode:** raw spoke provider (address-only) + tool returns unsigned tx payload(s). ([docs.sodax.com][4])

#### 6.2 Configuration Model

Config must support many agents and many wallets safely.

**Per-agent configuration (recommended for segregation)**
Use OpenClaw’s per-skill env injection (host-run) so each agent workspace can have distinct keys. ([OpenClaw][3])

**Config keys (MVP):**

* `AMPED_OC_MODE`: `execute | prepare` (default `execute`)
* `AMPED_OC_WALLETS_JSON`: JSON map keyed by `walletId`
  Each wallet entry includes:

  * `address` (required for prepare mode; derived/validated in execute mode)
  * `privateKey` (execute mode only; optional if using external signer integration later)
* `AMPED_OC_RPC_URLS_JSON`: map `{ [chainId]: rpcUrl }`
* `AMPED_OC_LIMITS_JSON`: policy limits (slippage, spend caps, allowlists)
* `AMPED_OC_SODAX_DYNAMIC_CONFIG`: boolean (if true, call `sodax.initialize()`) ([docs.sodax.com][7])

**Sandbox note:** If you intend to run these tools in sandboxed sessions, env injection differs (host env isn’t inherited). MVP can be host-only; document this clearly. ([OpenClaw][8])

---

### 7) Tool Surface (OpenClaw Tools)

All tool names should be stable, explicit, and prefixed to avoid collisions.

#### 7.1 Common Types

* `walletId: string`
* `chainId: string` (SODAX “spoke chain id” strings)
* `tokenAddress: string`
* `amount`: string in **human units** (tool converts to bigint using token decimals from SODAX config)
* `recipient: string` optional (default wallet address)
* `raw: boolean` (force prepare mode return)
* `policyId?: string` (optional profile selector)

#### 7.2 Discovery / Read Tools

1. `amped_oc_supported_chains`

   * Returns supported spoke chains (from `sodax.config.getSupportedSpokeChains()`). ([docs.sodax.com][2])

2. `amped_oc_supported_tokens`

   * Params: `{ module: "swaps"|"bridge"|"moneyMarket", chainId }`
   * Uses module helpers like `getSupportedSwapTokensByChainId` / money market supported token lists. ([docs.sodax.com][2])

3. `amped_oc_wallet_address`

   * Params: `{ walletId }`
   * Returns resolved address; validates private key ↔ address match in execute mode.

4. `amped_oc_money_market_positions`

   * Params: `{ walletId, chainId }`
   * Uses `sodax.moneyMarket.data.getUserReservesHumanized(spokeProvider)` (or raw + format). ([docs.sodax.com][7])

5. `amped_oc_money_market_reserves`

   * Params: `{ chainId? }` (hub-centric; optional)
   * Uses `data.getReservesHumanized()` etc. ([docs.sodax.com][7])

#### 7.3 Swap Tools

SODAX swaps expose quote, approval, swap, intent status, cancel. ([docs.sodax.com][2])

1. `amped_oc_swap_quote`

   * Params: `{ walletId, srcChainId, dstChainId, srcToken, dstToken, amount, type: "exact_input"|"exact_output", slippageBps }`
   * Output: normalized quote + fees (include solver/partner fee info if available).
   * Implementation uses `sodax.swaps.getQuote(request)` and computes deadline via `getSwapDeadline` if needed. ([docs.sodax.com][2])

2. `amped_oc_swap_execute`

   * Params: `{ walletId, quote, maxSlippageBps?, policyId?, skipSimulation?: false }`
   * Enforces PolicyEngine, allowance checks, and executes:

     * check allowance: `sodax.swaps.isAllowanceValid`
     * approve if needed: `sodax.swaps.approve`
     * execute: `sodax.swaps.swap` (execute mode only) ([docs.sodax.com][2])
   * Output: `{ spokeTxHash, hubTxHash?, intentHash?, status }` (as available)

3. `amped_oc_swap_status`

   * Params: `{ txHash }`
   * Uses `sodax.swaps.getStatus` and/or `getIntent/getFilledIntent`. ([docs.sodax.com][2])

4. `amped_oc_swap_cancel`

   * Params: `{ walletId, intent, srcChainId }`
   * Uses `sodax.swaps.cancelIntent(intent, spokeProvider, raw?)`. ([docs.sodax.com][2])

**Prepare-mode swap flow (if implemented in MVP):**

* tool returns raw deposit tx payload (from `createIntent` with `raw: true` via raw spoke provider),
* separate tool `amped_oc_swaps_submit_intent` to submit tx hash to relayer API (`submitIntent`) and continue posting to solver (`postExecution`) as required. ([docs.sodax.com][2])

#### 7.4 Bridge Tools

SODAX bridge exposes allowance/approve/bridge plus bridgeability helpers. ([docs.sodax.com][9])

1. `amped_oc_bridge_discover`

   * Params: `{ srcChainId, dstChainId, srcToken }`
   * Output: `{ bridgeableTokens[] }` via `getBridgeableTokens`. ([docs.sodax.com][9])

2. `amped_oc_bridge_quote`

   * Params: `{ srcChainId, dstChainId, srcToken, dstToken }`
   * Output:

     * `isBridgeable`
     * `maxBridgeableAmount` via `getBridgeableAmount`. ([docs.sodax.com][9])

3. `amped_oc_bridge_execute`

   * Params: `{ walletId, srcChainId, dstChainId, srcToken, dstToken, amount, recipient?, timeoutMs? }`
   * Flow:

     * `isAllowanceValid`
     * `approve` if needed
     * `bridge` returns `[spokeTxHash, hubTxHash]`. ([docs.sodax.com][9])

#### 7.5 Money Market Tools

SODAX money market exposes operations, approvals, and data retrieval. ([docs.sodax.com][7])

1. `amped_oc_mm_supply`
2. `amped_oc_mm_withdraw`
3. `amped_oc_mm_borrow`
4. `amped_oc_mm_repay`

Common params: `{ walletId, chainId, token, amount, timeoutMs? }`

Common flow:

* allowance: `sodax.moneyMarket.isAllowanceValid`
* approve: `sodax.moneyMarket.approve`
* operation: `supply|withdraw|borrow|repay` (full relay flow) ([docs.sodax.com][7])

Optional advanced:

* `amped_oc_mm_create_intent_*` variants that call `createSupplyIntent/createBorrowIntent/...` for custom pipelines. ([docs.sodax.com][7])

---

### 8) Skill Authoring (SKILL.md)

Ship a skill folder like `skills/amped-openclaw/SKILL.md` that teaches the model:

* When to use swap vs bridge vs money market tools
* Safety rules (always quote first; enforce caps; never drain wallet; verify chain/token supported)
* Parameter conventions (amount units, slippage bps)
* Typical workflows (quote→approve→execute→status; supply→positions)

OpenClaw skill format requirements (YAML frontmatter and instructions) are defined in the Skills docs. ([OpenClaw][3])

---

### 9) Policy & Safety Requirements (MVP must-have)

#### 9.1 Key segregation

* **Never** store or log private keys.
* Wallet resolution is **by walletId**; ensure each agent’s config only includes its own wallet(s).
* Cache spoke providers **per walletId**, never share across agents.

#### 9.2 Spend limits & allowlists

Enforce (configurable):

* `maxSwapInputUsd` / `maxSwapInputToken`
* `maxBridgeAmountToken`
* `maxBorrowUsd` and `maxBorrowToken`
* `allowedChains[]`
* `allowedTokensByChain`
* `blockedRecipients[]`
* `maxSlippageBps`

If policy fails → tool returns a structured error with remediation text.

#### 9.3 Simulation & preflight

* Default `skipSimulation=false` (and optionally disallow setting it true unless operator override), aligning with SODAX’s `skipSimulation` option in swap flows. ([docs.sodax.com][2])
* Always sanity-check:

  * quote freshness (deadline),
  * balance sufficiency (best-effort),
  * allowance status.

---

### 10) Observability & Reliability

#### Logging (structured)

* Include `requestId`, `agentId` (if available), `walletId`, `opType`, `chainIds`, `tokenAddresses`, and tx hashes.
* Do not log sensitive fields (private keys, full wallet JSON).

#### Idempotency

* Accept optional `clientOperationId` on execute tools; store in a short-lived cache to prevent duplicate broadcasts for retried calls.

#### Retries/timeouts

* Respect SDK operation timeouts (bridge and money market specify timeouts; defaults are documented). ([docs.sodax.com][9])
* Retry *read-only* calls (quotes/status) with exponential backoff.

---

### 11) Packaging & Deliverables

#### Repo structure (recommended)

* `packages/amped-openclaw-plugin/`

  * `src/index.ts` (plugin entry, registers tools)
  * `src/sodax/client.ts` (singleton + initialize)
  * `src/providers/spokeProviderFactory.ts`
  * `src/policy/policyEngine.ts`
  * `src/wallet/walletRegistry.ts`
  * `src/tools/*.ts` (tool handlers + schemas)
  * `openclaw.plugin.json`
  * `package.json`
* `skills/amped-openclaw/SKILL.md`

#### openclaw.plugin.json

Must define plugin id/name/version and point to skill directories; follow OpenClaw plugin manifest spec. ([docs.sodax.com][6])

#### Tool registration

Register each tool with `agentTools.register(...)` and TypeBox schema. ([docs.sodax.com][5])

---

### 12) Acceptance Criteria (MVP)

1. **Swap quote** returns a valid quote for supported chain/token pairs and fails gracefully for unsupported tokens.
2. **Swap execute**:

   * enforces policy caps and max slippage,
   * runs allowance check and approval when required,
   * returns tx hashes and a status handle.
3. **Bridge quote/discover**:

   * indicates bridgeability and max bridgeable amount for a token pair. ([docs.sodax.com][9])
4. **Bridge execute** completes and returns `[spokeTxHash, hubTxHash]` when successful. ([docs.sodax.com][9])
5. **Money market supply/borrow/repay/withdraw**:

   * work end-to-end on at least one EVM spoke chain + Sonic hub,
   * return success + hashes,
   * positions tool reflects updated state via humanized user reserves. ([docs.sodax.com][7])
6. **Sonic provider correctness**: Sonic ops use `SonicSpokeProvider` and do not accidentally use the generic EVM provider. ([docs.sodax.com][4])
7. **Secrets handling**: no key material appears in logs; env injection approach documented for operators. ([OpenClaw][8])

---

### 13) Implementation Notes for the Coding Agent (important)

* Prefer `@sodax/sdk` as the primary dependency; use wallet provider implementations from `@sodax/wallet-sdk-core` where possible (Node EVM signer implementation), as suggested by SODAX spoke provider docs. ([docs.sodax.com][4])
* Cache chain config + token decimals from `sodax.config` for amount parsing/formatting; if `AMPED_OC_SODAX_DYNAMIC_CONFIG=true`, call `await sodax.initialize()` at startup. ([docs.sodax.com][7])
* MVP should start with **execute mode** (agent has key), then add **prepare mode** if you want on-device signing flows.

---

If you want, I can also generate a **ready-to-paste `skills/amped-openclaw/SKILL.md`** (with the exact tool names, safety rules, and usage examples) that matches OpenClaw’s skill frontmatter and gating conventions.

[1]: https://docs.sodax.com/developers/packages/1.-the-foundation/sdk "@sodax/sdk | Docs"
[2]: https://docs.sodax.com/developers/packages/1.-the-foundation/sdk/functional-modules/swaps "Swaps (Solver) | Docs"
[3]: https://docs.openclaw.ai/tools/skills "Skills - OpenClaw"
[4]: https://docs.sodax.com/developers/how-to/how_to_create_a_spoke_provider "Create a Spoke Provider | Docs"
[5]: https://docs.sodax.com/developers/deployments/solver-compatible-assets "Swap: Compatible Assets | Docs"
[6]: https://docs.sodax.com/developers/deployments/solver_api_endpoints "Solver API endpoints | Docs"
[7]: https://docs.sodax.com/developers/packages/1.-the-foundation/sdk/functional-modules/money_market "Lend / Borrow (Money Market) | Docs"
[8]: https://docs.openclaw.ai/tools/skills-config "Skills Config - OpenClaw"
[9]: https://docs.sodax.com/developers/packages/1.-the-foundation/sdk/functional-modules/bridge "Bridge | Docs"

