export interface SlideEntry {
  id: string;
  file: string;
  steps?: number;
  speakerNotes?: string;
}

export interface DeckManifest {
  title: string;
  aspectRatio: "16:9";
  width: 1920;
  height: 1080;
  theme: string;
  slides: SlideEntry[];
}

export interface SlideDefinition {
  html: string;
  css?: string;
  steps?: number;
  onEnter?: (root: HTMLElement) => void | Promise<void>;
  onStep?: (root: HTMLElement, step: number) => void | Promise<void>;
  onLeave?: (root: HTMLElement) => void | Promise<void>;
}

export interface IntegrityManifest {
  algorithm: "sha256";
  files: Record<string, string>;
}

export interface SlideOverflowEntry {
  selector: string;
  bounds: {
    top: number;
    left: number;
    right: number;
    bottom: number;
  };
}

export interface SlideDiagnostics {
  slideIndex: number;
  stepIndex: number;
  overflows: SlideOverflowEntry[];
  consoleErrors: string[];
  brokenAssets: string[];
}

export interface InspectSlideResult {
  screenshotBase64: string;
  mimeType: "image/webp" | "image/png";
  diagnostics: SlideDiagnostics;
}

export interface FoilDeckOptions {
  productionLockdown?: boolean;
}
