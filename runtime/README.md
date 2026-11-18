# `@foil-engine/runtime`

Zero-framework client runtime for `1920x1080` **Foil** presentations.

## Features

- **Proportional Stage Scaling (`stage.ts`):** `computeProportionalScale` and `applyStageTransform` keep the `16:9` logical canvas (`1920x1080`) centered without scrollbars.
- **Slide Lifecycle (`FoilDeck`):** Orchestrates `onEnter`, `onStep`, and `onLeave` hooks with HMR state preservation (`__FOIL_HMR_STATE__`).
- **Runtime Lockdown (`security.ts`):** `enableRuntimeLockdown` freezes and disables `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`, `Worker`, `SharedWorker`, `eval`, and `Function` in production.
- **Diagnostics (`diagnostics.ts`):** `detectSlideOverflows`, `detectBrokenAssets`, and `collectDiagnostics` report layout and asset issues.
- **Presenter Sync (`presenter.ts`):** `PresenterBridge` coordinates slide/step index and speaker notes.

## Installation

```bash
bun add @foil-engine/runtime
```

## Usage

```ts
import { FoilDeck, enableRuntimeLockdown } from "@foil-engine/runtime";

enableRuntimeLockdown();

const deck = new FoilDeck(manifest, slides, document.getElementById("foil-root")!);
await deck.mount();
```

## License

MIT
