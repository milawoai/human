# Body (Electron Live2D Pet)

This package is the "body" subproject in the Human monorepo.

It is an Electron + Vue 3 app that provides a transparent always-on-top Live2D Pet window, a tray-first startup flow, and a small local automation server for controlling the Pet (text/motion/expression/audio).

## Key Features

- Pet window: transparent, frameless, always-on-top
- Live2D: Cubism WebSDK-based rendering, hit-test, motions, expressions
- Interaction:
  - Click hit area -> play motion
  - Hold the model -> drag the Pet window
  - Wheel -> scale model + resize Pet window to avoid clipping
- Local server: minimal "perform" protocol to drive subtitle/motion/expression/audio
- Lip sync: audio-driven mouth movement via WebAudio analyser (does not rely on Live2D internal fetch-based wav loader)

## Architecture (High Level)

- main (Electron main process)
  - WindowManager: creates main window and Pet window
  - services + IPC handlers: `src/main/services/*` wired by `src/main/handler.ts`
  - local Express server: `src/main/server/*`
- renderer (Vue 3)
  - Pet page: `src/renderer/src/pages/pet/index.vue`
  - Live2D adapter: `src/renderer/src/adapters/live2dPetAdapter.ts`
- shared
  - IPC keys: `src/shared/datas/ipc.ts`
  - Pet settings: `src/shared/petSettings.ts`
  - Perform protocol: `src/shared/live2dPerformance.ts`

## HTTP APIs

The local server runs on the configured port (default `12001`).

- `POST /api/pet/perform`
  - payload: `{ text?, motion?, expression?, audioUrl? }`
  - drives subtitle/motion/expression/audio in the Pet window

More endpoints are documented in `docs/server-interfaces.md` and `src/main/server/serverInterfaces.json`.

## Development

From the monorepo root:

- `yarn dev` (turbo parallel)
- Or run this package directly:
  - `yarn dev`

VS Code debugging is configured in the monorepo `.vscode/launch.json`.

