import { describe, expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import {
  computeSha256Hex,
  isValidPresenterSyncMessage,
  unpackFoilArchiveInBrowser
} from "../src/main.ts";

async function buildSignedTestFoilBuffer(
  files: Record<string, Uint8Array>,
  tamperFile?: { path: string; newContent: Uint8Array }
): Promise<Uint8Array> {
  const hashes: Record<string, string> = {};
  for (const [path, bytes] of Object.entries(files)) {
    hashes[path] = await computeSha256Hex(bytes);
  }
  const integrityJson = JSON.stringify({
    algorithm: "sha256",
    files: hashes
  });

  const zipInput: Record<string, Uint8Array> = {
    ...files,
    "integrity.json": strToU8(integrityJson)
  };

  if (tamperFile) {
    zipInput[tamperFile.path] = tamperFile.newContent;
  }

  return zipSync(zipInput);
}

describe("@foil-engine/web-player", () => {
  test("unpacks valid .foil archive, verifies SHA-256 integrity, and mounts in opaque sandbox=allow-scripts iframe", async () => {
    const indexHtml = strToU8("<!doctype html><html><head></head><body><h1>Slide</h1><script src=\"./app.js\"></script></body></html>");
    const appJs = strToU8("console.log('ready');");
    const manifestJson = strToU8(
      JSON.stringify({
        title: "Web Deck",
        aspectRatio: "16:9",
        width: 1920,
        height: 1080,
        theme: "default",
        slides: []
      })
    );

    const buffer = await buildSignedTestFoilBuffer({
      "index.html": indexHtml,
      "app.js": appJs,
      "manifest.json": manifestJson
    });

    const unpacked = await unpackFoilArchiveInBrowser(buffer);
    expect(unpacked.manifest.title).toBe("Web Deck");
    expect(unpacked.sandboxedSrcDoc).toContain("connect-src 'none'");
    expect(unpacked.sandboxedSrcDoc).toContain("Foil Security Violation");
    expect(unpacked.sandboxedSrcDoc).toContain("blob:");

    let appendedIframe: HTMLIFrameElement | null = null;
    const mockContainer = {
      appendChild(el: HTMLIFrameElement) {
        appendedIframe = el;
        return el;
      }
    } as unknown as HTMLElement;

    const iframe = unpacked.mountInSandboxedIframe(mockContainer);
    expect(appendedIframe).not.toBeNull();
    expect((iframe as unknown as Record<string, string>)["sandbox"]).toBe("allow-scripts");
    expect((iframe as unknown as Record<string, string>)["sandbox"]).not.toContain("allow-same-origin");

    unpacked.revokeAll();
  });

  test("aborts unpacking when SHA-256 hash in integrity.json does not match tampered file", async () => {
    const buffer = await buildSignedTestFoilBuffer(
      {
        "index.html": strToU8("<h1>Clean</h1>")
      },
      {
        path: "index.html",
        newContent: strToU8("<h1>Malicious Tampered</h1>")
      }
    );

    await expect(unpackFoilArchiveInBrowser(buffer)).rejects.toThrow(/Integrity hash mismatch/);
  });

  test("rejects zip slip traversal, disallowed extensions, and zip bomb size limits", async () => {
    const zipSlipBuffer = zipSync({
      "../escape.html": strToU8("<h1>bad</h1>")
    });
    await expect(unpackFoilArchiveInBrowser(zipSlipBuffer)).rejects.toThrow(/Invalid archive path/);

    const badExtBuffer = zipSync({
      "malware.sh": strToU8("rm -rf /")
    });
    await expect(unpackFoilArchiveInBrowser(badExtBuffer)).rejects.toThrow(/Disallowed extension/);

    const bombBuffer = await buildSignedTestFoilBuffer({
      "index.html": new Uint8Array(2048)
    });
    await expect(unpackFoilArchiveInBrowser(bombBuffer, { maxTotalBytes: 512 })).rejects.toThrow(
      /Archive exceeds maximum uncompressed size/
    );
  });

  test("isValidPresenterSyncMessage enforces strict zero-privilege schema", () => {
    expect(
      isValidPresenterSyncMessage({
        type: "presenter_sync",
        slide_index: 1,
        step_index: 0
      })
    ).toBe(true);

    expect(
      isValidPresenterSyncMessage({
        type: "presenter_sync",
        slide_index: 1,
        step_index: 0,
        evil_cmd: "steal_cookies"
      })
    ).toBe(false);
  });
});
