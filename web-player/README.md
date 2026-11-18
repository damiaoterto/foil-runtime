# `@foil-engine/web-player`

Browser-based `.foil` archive unpacker and sandboxed player for **Foil** presentations.

## Features

- **Archive Validation (`loader.ts`):** Enforces Zip-Slip path checks, extension allowlist (`ALLOWED_EXTENSIONS`), file count (`<= 1,000`), and uncompressed size (`<= 250 MB`) limits before unpacking via `fflate`.
- **SHA-256 Integrity:** Verifies every unpacked file against `integrity.json` using Web Crypto (`computeSha256Hex`).
- **Opaque Iframe Sandbox (`mountFoilArchiveBuffer`):** Mounts decks inside `<iframe sandbox="allow-scripts">` with strict offline CSP (`PRODUCTION_IFRAME_CSP`) and schema-validated presenter messages (`isValidPresenterSyncMessage`).

## Installation

```bash
bun add @foil-engine/web-player
```

## Usage

```ts
import { mountFoilArchiveBuffer } from "@foil-engine/web-player";

const bytes = new Uint8Array(await file.arrayBuffer());
const deck = await mountFoilArchiveBuffer(bytes, document.getElementById("player")!);
```

## License

MIT
