<h1 align="center">Foil Packages (<code>@foil-engine/runtime</code> &amp; <code>@foil-engine/web-player</code>)</h1>

<p align="center">
  Bun TypeScript workspace providing the client runtime, security lockdown, stage scaling, and browser-based sandboxed <code>.foil</code> archive player for the <strong>Foil</strong> presentation engine.
</p>

---

## Workspace Architecture (`packages/`)

```text
packages/
├── package.json
├── tsconfig.base.json
├── runtime/                 # @foil-engine/runtime: stage scaling, slide lifecycle, lockdown, diagnostics
│   ├── src/
│   │   ├── index.ts         # FoilDeck orchestrator & public exports
│   │   ├── stage.ts         # 1920x1080 proportional scaling (computeProportionalScale)
│   │   ├── security.ts      # Production runtime lockdown (enableRuntimeLockdown)
│   │   ├── presenter.ts     # PresenterBridge state sync
│   │   ├── diagnostics.ts   # Overflow & broken asset detection
│   │   └── types.ts
│   └── tests/
│       └── runtime.test.ts
└── web-player/              # @foil-engine/web-player: browser .foil unpacker & opaque iframe sandbox
    ├── index.html
    ├── vite.config.ts
    ├── src/
    │   ├── main.ts          # mountFoilArchiveBuffer & isValidPresenterSyncMessage
    │   └── loader.ts        # fflate unzip, SHA-256 verification, Zip-Slip/Bomb guards
    └── tests/
        └── loader.test.ts
```

---

## Packages

### `@foil-engine/runtime`
Zero-framework runtime for `1920x1080` Foil decks:
- **Stage Scaling (`stage.ts`):** `computeProportionalScale` and `applyStageTransform` keep the `16:9` logical canvas (`1920x1080`) centered without scrollbars.
- **Slide Lifecycle (`FoilDeck`):** Executes `onEnter`, `onStep`, and `onLeave` hooks with HMR state preservation (`__FOIL_HMR_STATE__`).
- **Runtime Lockdown (`security.ts`):** `enableRuntimeLockdown` freezes and disables `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`, `Worker`, `SharedWorker`, `eval`, and `Function` in production.
- **Diagnostics (`diagnostics.ts`):** `detectSlideOverflows`, `detectBrokenAssets`, and `collectDiagnostics` report layout and asset issues.
- **Presenter Sync (`presenter.ts`):** `PresenterBridge` coordinates slide/step index and speaker notes.

### `@foil-engine/web-player`
Browser player for `.foil` archives:
- **Archive Validation (`loader.ts`):** Enforces Zip-Slip path checks, extension allowlist, file count (`<= 1,000`) and uncompressed size (`<= 250 MB`) limits before unpacking via `fflate`.
- **SHA-256 Integrity:** Verifies every unpacked file against `integrity.json` using Web Crypto (`computeSha256Hex`).
- **Opaque Sandbox (`mountFoilArchiveBuffer`):** Mounts decks inside `<iframe sandbox="allow-scripts">` with strict offline CSP (`PRODUCTION_IFRAME_CSP`) and schema-validated presenter messages (`isValidPresenterSyncMessage`).

---

## Development

Requirements: [Bun](https://bun.com/) (`v1.x`).

```bash
bun install --frozen-lockfile --ignore-scripts
bun test
```

Build `@foil-engine/web-player`:

```bash
cd web-player
bun run build
```

---

## CI & NPM Publishing

GitHub Actions ([ci-release.yml](.github/workflows/ci-release.yml)) runs `bun install --frozen-lockfile --ignore-scripts`, `bun test`, and `vite build` on `push`/`pull_request` to `main`, uploads `web-player/dist` as `foil-web-player-dist`, and publishes `@foil-engine/runtime` and `@foil-engine/web-player` to NPM on `release` (`published`) or `v*` tags using `NPM_TOKEN`.

---

## License

[MIT](LICENSE)
