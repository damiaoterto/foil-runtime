import {
  getInlineRuntimeLockdownScript,
  type DeckManifest,
  type IntegrityManifest
} from "@foil/runtime";
import { strFromU8, unzipSync } from "fflate";

export const MAX_ARCHIVE_FILES = 1000;
export const MAX_ARCHIVE_TOTAL_BYTES = 250 * 1024 * 1024;
export const ALLOWED_EXTENSIONS = new Set([
  "html",
  "js",
  "css",
  "json",
  "webp",
  "avif",
  "png",
  "jpg",
  "svg",
  "woff2",
  "mp4",
  "glb"
]);

export const PRODUCTION_IFRAME_CSP =
  "default-src 'self' blob: data:; script-src 'self' blob: 'unsafe-inline'; style-src 'self' blob: 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' blob: data:; media-src 'self' blob: data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";

export interface UnpackedWebDeck {
  manifest: DeckManifest;
  sandboxedSrcDoc: string;
  assetBlobUrls: Record<string, string>;
  mountInSandboxedIframe(container: HTMLElement): HTMLIFrameElement;
  revokeAll(): void;
}

export interface UnpackLimits {
  maxFiles?: number;
  maxTotalBytes?: number;
}

export async function computeSha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  const view = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < view.length; i++) {
    const b = view[i] ?? 0;
    hex += b.toString(16).padStart(2, "0");
  }
  return hex;
}

export function validateArchiveEntryPath(rawPath: string): string {
  if (
    !rawPath ||
    rawPath.startsWith("/") ||
    rawPath.startsWith("\\") ||
    rawPath.includes("\\") ||
    rawPath.includes(":") ||
    rawPath.includes("\0")
  ) {
    throw new Error(`Invalid archive path: ${rawPath}`);
  }

  const segments = rawPath.split("/");
  for (const seg of segments) {
    if (!seg || seg === "." || seg === "..") {
      throw new Error(`Invalid archive path traversal: ${rawPath}`);
    }
  }

  const dotIdx = rawPath.lastIndexOf(".");
  if (dotIdx <= 0 || dotIdx === rawPath.length - 1) {
    throw new Error(`Disallowed extension in archive path: ${rawPath}`);
  }
  const ext = rawPath.slice(dotIdx + 1).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`Disallowed extension in archive path: ${rawPath}`);
  }

  return segments.join("/");
}

export async function unpackFoilArchiveInBrowser(
  buffer: Uint8Array,
  limits: UnpackLimits = {}
): Promise<UnpackedWebDeck> {
  const maxFiles = limits.maxFiles ?? MAX_ARCHIVE_FILES;
  const maxTotalBytes = limits.maxTotalBytes ?? MAX_ARCHIVE_TOTAL_BYTES;

  const entries = unzipSync(buffer);
  const fileNames = Object.keys(entries).filter((name) => !name.endsWith("/"));

  if (fileNames.length > maxFiles) {
    throw new Error(`Archive exceeds maximum file count (${fileNames.length} > ${maxFiles})`);
  }

  let totalBytes = 0;
  const normalizedEntries: Record<string, Uint8Array> = {};

  for (const rawName of fileNames) {
    const cleanName = validateArchiveEntryPath(rawName);
    const content = entries[rawName];
    if (!content) {
      continue;
    }
    totalBytes += content.byteLength;
    if (totalBytes > maxTotalBytes) {
      throw new Error(`Archive exceeds maximum uncompressed size (${totalBytes} > ${maxTotalBytes})`);
    }
    normalizedEntries[cleanName] = content;
  }

  const integrityRaw = normalizedEntries["integrity.json"];
  if (!integrityRaw) {
    throw new Error("Missing integrity.json in .foil archive");
  }

  const integrity = JSON.parse(strFromU8(integrityRaw)) as IntegrityManifest;
  if (integrity.algorithm !== "sha256" || !integrity.files) {
    throw new Error(`Unsupported integrity algorithm: ${String(integrity.algorithm)}`);
  }

  for (const [filePath, expectedHash] of Object.entries(integrity.files)) {
    const fileBytes = normalizedEntries[filePath];
    if (!fileBytes) {
      throw new Error(`Integrity verification failed: missing file ${filePath}`);
    }
    const actualHash = await computeSha256Hex(fileBytes);
    if (actualHash !== expectedHash) {
      throw new Error(`Integrity hash mismatch for ${filePath}: expected ${expectedHash}, actual ${actualHash}`);
    }
  }

  for (const presentFile of Object.keys(normalizedEntries)) {
    if (presentFile !== "integrity.json" && !(presentFile in integrity.files)) {
      throw new Error(`Unlisted file in archive not present in integrity.json: ${presentFile}`);
    }
  }

  const manifestBytes = normalizedEntries["manifest.json"];
  const manifest: DeckManifest = manifestBytes
    ? (JSON.parse(strFromU8(manifestBytes)) as DeckManifest)
    : {
        title: "Foil Deck",
        aspectRatio: "16:9",
        width: 1920,
        height: 1080,
        theme: "default",
        slides: []
      };

  const assetBlobUrls: Record<string, string> = {};
  for (const [filePath, bytes] of Object.entries(normalizedEntries)) {
    if (filePath === "index.html" || filePath === "integrity.json") {
      continue;
    }
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const blob = new Blob([copy.buffer], { type: mimeForPath(filePath) });
    assetBlobUrls[filePath] = URL.createObjectURL(blob);
  }

  const rawHtml = normalizedEntries["index.html"]
    ? strFromU8(normalizedEntries["index.html"])
    : "<!doctype html><html><head></head><body><div id=\"foil-root\"></div></body></html>";

  const sandboxedSrcDoc = buildHardenedSrcDoc(rawHtml, assetBlobUrls);

  return {
    manifest,
    sandboxedSrcDoc,
    assetBlobUrls,
    mountInSandboxedIframe(container: HTMLElement): HTMLIFrameElement {
      const doc = container.ownerDocument;
      const iframe = doc
        ? doc.createElement("iframe")
        : ({
            setAttribute(k: string, v: string) {
              (this as Record<string, unknown>)[k] = v;
            },
            style: {}
          } as unknown as HTMLIFrameElement);

      iframe.setAttribute("sandbox", "allow-scripts");
      iframe.setAttribute("referrerpolicy", "no-referrer");
      iframe.setAttribute("srcdoc", sandboxedSrcDoc);
      iframe.srcdoc = sandboxedSrcDoc;
      if (iframe.style) {
        iframe.style.width = "100%";
        iframe.style.height = "100%";
        iframe.style.border = "0";
      }
      container.appendChild(iframe);
      return iframe;
    },
    revokeAll(): void {
      for (const url of Object.values(assetBlobUrls)) {
        URL.revokeObjectURL(url);
      }
    }
  };
}

function buildHardenedSrcDoc(rawHtml: string, assetBlobUrls: Record<string, string>): string {
  let rewritten = rawHtml;
  const pairs = Object.entries(assetBlobUrls).sort((a, b) => b[0].length - a[0].length);

  for (const [relPath, blobUrl] of pairs) {
    rewritten = rewritten.split(`./${relPath}`).join(blobUrl);
    rewritten = rewritten.split(relPath).join(blobUrl);
  }

  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${PRODUCTION_IFRAME_CSP}">`;
  const lockdownScript = `<script>${getInlineRuntimeLockdownScript()}</script>`;
  const injection = `${cspMeta}${lockdownScript}`;

  if (rewritten.includes("<head>")) {
    return rewritten.replace("<head>", `<head>${injection}`);
  }
  return `<!doctype html><html><head>${injection}</head><body>${rewritten}</body></html>`;
}

function mimeForPath(path: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  switch (ext) {
    case "js":
      return "text/javascript";
    case "css":
      return "text/css";
    case "json":
      return "application/json";
    case "svg":
      return "image/svg+xml";
    case "webp":
      return "image/webp";
    case "avif":
      return "image/avif";
    case "png":
      return "image/png";
    case "jpg":
      return "image/jpeg";
    case "woff2":
      return "font/woff2";
    case "mp4":
      return "video/mp4";
    case "glb":
      return "model/gltf-binary";
    default:
      return "application/octet-stream";
  }
}
