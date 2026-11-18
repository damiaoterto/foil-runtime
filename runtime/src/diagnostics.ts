import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from "./stage.ts";
import type { SlideDiagnostics, SlideOverflowEntry } from "./types.ts";

export function detectSlideOverflows(
  stageElement: HTMLElement,
  logicalWidth: number = LOGICAL_WIDTH,
  logicalHeight: number = LOGICAL_HEIGHT
): SlideOverflowEntry[] {
  const overflows: SlideOverflowEntry[] = [];
  const stageRect = typeof stageElement.getBoundingClientRect === "function"
    ? stageElement.getBoundingClientRect()
    : { top: 0, left: 0, right: logicalWidth, bottom: logicalHeight, width: logicalWidth, height: logicalHeight };

  const scaleX = stageRect.width > 0 ? stageRect.width / logicalWidth : 1;
  const scaleY = stageRect.height > 0 ? stageRect.height / logicalHeight : 1;

  const elements = typeof stageElement.querySelectorAll === "function"
    ? Array.from(stageElement.querySelectorAll<HTMLElement>("*"))
    : [];

  for (const el of elements) {
    if (typeof el.getBoundingClientRect !== "function") {
      continue;
    }
    const rect = el.getBoundingClientRect();
    const relLeft = (rect.left - stageRect.left) / scaleX;
    const relTop = (rect.top - stageRect.top) / scaleY;
    const relRight = (rect.right - stageRect.left) / scaleX;
    const relBottom = (rect.bottom - stageRect.top) / scaleY;

    if (relLeft < -0.5 || relTop < -0.5 || relRight > logicalWidth + 0.5 || relBottom > logicalHeight + 0.5) {
      overflows.push({
        selector: buildElementSelector(el),
        bounds: {
          top: Math.round(relTop),
          left: Math.round(relLeft),
          right: Math.round(relRight),
          bottom: Math.round(relBottom)
        }
      });
    }
  }

  return overflows;
}

export function detectBrokenAssets(stageElement: HTMLElement): string[] {
  const broken: string[] = [];
  if (typeof stageElement.querySelectorAll !== "function") {
    return broken;
  }
  const images = Array.from(stageElement.querySelectorAll<HTMLImageElement>("img"));
  for (const img of images) {
    if (img.complete && img.naturalWidth === 0) {
      broken.push(img.getAttribute("src") ?? "<unknown-img>");
    }
  }
  return broken;
}

export function collectDiagnostics(
  stageElement: HTMLElement,
  slideIndex: number,
  stepIndex: number,
  consoleErrors: readonly string[] = []
): SlideDiagnostics {
  return {
    slideIndex,
    stepIndex,
    overflows: detectSlideOverflows(stageElement),
    consoleErrors: [...consoleErrors],
    brokenAssets: detectBrokenAssets(stageElement)
  };
}

function buildElementSelector(el: HTMLElement): string {
  const tag = (el.tagName || "div").toLowerCase();
  const idPart = el.id ? `#${el.id}` : "";
  const classPart = el.className && typeof el.className === "string"
    ? "." + el.className.trim().split(/\s+/).join(".")
    : "";
  return `${tag}${idPart}${classPart}`;
}
