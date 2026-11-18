import { PresenterBridge, type PresenterSyncPayload } from "@foil-engine/runtime";
import { unpackFoilArchiveInBrowser, type UnpackedWebDeck } from "./loader.ts";

export {
  ALLOWED_EXTENSIONS,
  computeSha256Hex,
  MAX_ARCHIVE_FILES,
  MAX_ARCHIVE_TOTAL_BYTES,
  PRODUCTION_IFRAME_CSP,
  unpackFoilArchiveInBrowser,
  validateArchiveEntryPath,
  type UnpackedWebDeck
} from "./loader.ts";

export function isValidPresenterSyncMessage(payload: unknown): payload is PresenterSyncPayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const obj = payload as Record<string, unknown>;
  const allowedKeys = new Set(["type", "slide_index", "step_index", "speaker_notes"]);
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      return false;
    }
  }
  return (
    obj["type"] === "presenter_sync" &&
    typeof obj["slide_index"] === "number" &&
    typeof obj["step_index"] === "number"
  );
}

export async function mountFoilArchiveBuffer(
  buffer: Uint8Array,
  container: HTMLElement
): Promise<UnpackedWebDeck> {
  const deck = await unpackFoilArchiveInBrowser(buffer);
  deck.mountInSandboxedIframe(container);
  const bridge = new PresenterBridge();

  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("message", (event: MessageEvent) => {
      if (isValidPresenterSyncMessage(event.data)) {
        bridge.sync(event.data.slide_index, event.data.step_index, event.data.speaker_notes);
      }
    });
  }

  return deck;
}
