# VETO implementation plan

The tracked `docs/` architecture is the build contract. The older local PRD describes a different, larger agent runner; it is background only. Full end-to-end testing is deferred at the user's request. Each completed action below receives a focused micro test and its own commit.

## Phase 0 — contracts and policy decisions

- [x] Define the exact authorization/result shapes, fingerprint rules, policy configuration, and initial safety defaults.
- [x] Record resolved policy choices and unresolved Laya/host prerequisites.

Gate: fixed requests and policy settings have deterministic, documented meaning.

## Phase 1 — decision core

- [x] Implement request validation, canonical action fingerprinting, hard restrictions, and policy resolution.
- [x] Implement run history, repetition/result accounting, and append-only decisions.
- [x] Add focused micro tests for every critical branch and fail-closed behavior.

Gate: fixed classifier answers map to reviewed decisions; VETO never executes an action.

## Phase 2 — MCP gateway and Laya

- [ ] Verify Laya package provenance, license, actual installed MCP tool schema, and pin versions.
- [ ] Implement VETO MCP tools and Laya client adapter with timeout and response validation.

Gate: a real Laya round trip produces a logged decision; invalid/unavailable answers deny.

## Phase 3 — host proof and evidence

- [ ] Integrate a host with a mandatory pre-action hook and isolated disposable workspace.
- [ ] Demonstrate safe allow, protected deletion, no-progress repetition, invented path, and cost accounting.
- [ ] Run complete tests and document observed evidence when requested.

Gate: transcript and log prove that denied actions were never executed.

## Implementation choices

- Node.js modules with native `node:test` for the initial core, avoiding a dependency install before the Laya/MCP package check.
- YAML policy is user-editable. The loader will support a deliberately narrow YAML subset and reject unknown keys or malformed values rather than silently accepting unsafe settings.
- STOP limits are checked before classifier invocation. Hard restrictions follow. Missing or invalid classifier output denies with `manual_review`.
- Monetary/provider cost stays `unknown` unless supplied by the host; tool-call counts and elapsed time are separate.
