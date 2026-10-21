# Desktop Agent Test Panel Implementation Plan

**Goal:** Provide an independent desktop entry to exercise the existing Pi Agent path without changing Cortex chat.

**Architecture:** A Vue panel uses allowlisted Electron IPC. Main process opens one panel and subscribes to Neural Agent events before HTTP execution, forwarding only the active session to that panel. Existing BrainAgentService remains the runtime; add an explicit `none` tool preset for safe first tests. No Durable/Chord migration, cancellation or crash-recovery claim in this change.

**Tech Stack:** Vue 3, Electron, Socket.IO, existing Neural HTTP, Pi Agent 1.2.0, Node tests and ts-node smoke.

## Design and acceptance

Independent Agent panel preserves original chat and hearing behavior. Live2D exposes an Agent test button. Users enter a task, optional model profile, select no tools / all tools / coding tools, create sessions, and restore recent sessions. Model events render text, thinking, tool arguments/results and execution status. Backend errors remain visible. During a run, controls prevent duplicate submission and session switching; no fake stop button. Permission warning precedes tool activation. Run observation uses a dedicated short-lived actor and subscription acknowledgement to avoid races or interfering with existing hearing subscriptions.

## Implementation sequence

1. Write failing tests for Agent request validation, Neural response unwrapping, event isolation/reduction and backend no-tools selection. Run Node tests / ts-node smoke and observe failure.
2. Implement pure shared event/request utilities and backend `none` preset. Verify no tools exposed in that mode and preserve existing presets.
3. Implement dedicated main-process Agent bridge, subscription handshake and cleanup; register IPC and route. Implement panel and Live2D entry. Inspect concrete event shapes in installed Pi source.
4. Run Body Node tests, backend smoke, both typechecks and builds. Exercise real Electron page with a controlled Neural fixture and actual backend where available. Do not run destructive real tools for verification.
5. Preserve Body changes in a separate reversible patch because apps/body has a gitlink but no git metadata (human-ryp). Document usage, evidence and limitations; close issue and commit/push only task artifacts.

## Commands

`node --experimental-strip-types --test apps/body/src/shared/agent-panel.test.ts`

`yarn workspace backend exec ts-node scripts/agent-panel-smoke.ts`

`yarn workspace electron_with_serve typecheck`

`yarn workspace electron_with_serve build:no-lint`

`yarn workspace backend typecheck` and `yarn workspace backend build`

## Version control boundary

Keep existing Body edits and parent gitlink unchanged. Archive a delta from this turn's initial files, not the earlier TTS baseline. Do not restore submodule metadata without user direction.

## Verification evidence

- Body Agent tests: 6 passed; TTS regression tests: 4 passed.
- Body main/renderer typechecks and production build passed. Backend typecheck and build passed.
- Backend `verify:agent-panel`: actual installed Pi Agent executes a deterministic two-model-turn / one-tool-call run, emits tool lifecycle events and persists the result. Separate no-tools execution makes one model turn and zero tool calls.
- Final Electron CDP verification passed on the built application: Live2D entry, default no-tools mode, real default-model two-turn recall of a test code, busy controls, history restoration, invalid-profile error and recovery. Final test session: `b0cfeec7-eed2-4063-8bc5-06920d37229d`. Screenshot: `/private/tmp/human-agent-panel.png`.
- `git apply --reverse --check patches/body-agent-test-panel.patch` passed against the applied local Body source.
- Existing Node typeless-package warning, Browserslist age and Vite shared dynamic/static chunk warnings remain; they did not fail checks.
- Cancellation and server-side run lifecycle follow-up: `human-152`. Body git metadata follow-up: `human-ryp`.
