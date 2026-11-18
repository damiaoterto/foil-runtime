import { collectDiagnostics, detectBrokenAssets, detectSlideOverflows } from "./diagnostics.ts";
import { PresenterBridge, type PresenterSyncPayload } from "./presenter.ts";
import { createLockedDownThrower, enableRuntimeLockdown, getInlineRuntimeLockdownScript } from "./security.ts";
import { applyStageTransform, computeProportionalScale, LOGICAL_HEIGHT, LOGICAL_WIDTH } from "./stage.ts";
import type {
  DeckManifest,
  FoilDeckOptions,
  InspectSlideResult,
  IntegrityManifest,
  SlideDefinition,
  SlideDiagnostics,
  SlideEntry,
  SlideOverflowEntry
} from "./types.ts";

export {
  applyStageTransform,
  collectDiagnostics,
  computeProportionalScale,
  createLockedDownThrower,
  detectBrokenAssets,
  detectSlideOverflows,
  enableRuntimeLockdown,
  getInlineRuntimeLockdownScript,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  PresenterBridge
};

export type {
  DeckManifest,
  FoilDeckOptions,
  InspectSlideResult,
  IntegrityManifest,
  PresenterSyncPayload,
  SlideDefinition,
  SlideDiagnostics,
  SlideEntry,
  SlideOverflowEntry
};

interface HmrStateStore {
  __FOIL_HMR_STATE__?: {
    slideIndex: number;
    stepIndex: number;
  };
}

export class FoilDeck {
  private readonly manifest: DeckManifest;
  private readonly slides: Record<string, SlideDefinition>;
  private readonly rootElement: HTMLElement;
  private readonly options: FoilDeckOptions;
  private readonly presenterBridge: PresenterBridge;
  private readonly consoleErrors: string[] = [];
  private stageElement: HTMLElement | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private activeSlideDef: SlideDefinition | null = null;
  private slideIndex: number = 0;
  private stepIndex: number = 0;
  private mounted: boolean = false;

  constructor(
    manifest: DeckManifest,
    slides: Record<string, SlideDefinition>,
    rootElement: HTMLElement,
    options: FoilDeckOptions = {}
  ) {
    this.manifest = manifest;
    this.slides = slides;
    this.rootElement = rootElement;
    this.options = options;
    this.presenterBridge = new PresenterBridge();

    const store = globalThis as unknown as HmrStateStore;
    if (store.__FOIL_HMR_STATE__) {
      this.slideIndex = store.__FOIL_HMR_STATE__.slideIndex;
      this.stepIndex = store.__FOIL_HMR_STATE__.stepIndex;
    }
  }

  async mount(): Promise<void> {
    if (this.options.productionLockdown) {
      enableRuntimeLockdown();
    }

    const doc = this.rootElement.ownerDocument;
    if (doc) {
      const stage = doc.createElement("div");
      stage.className = "foil-stage";
      const style = doc.createElement("style");
      style.setAttribute("data-foil-slide-style", "true");
      this.rootElement.innerHTML = "";
      this.rootElement.appendChild(style);
      this.rootElement.appendChild(stage);
      this.stageElement = stage;
      this.styleElement = style;
    } else {
      this.stageElement = this.rootElement;
    }

    const vw = typeof window !== "undefined" && window.innerWidth ? window.innerWidth : LOGICAL_WIDTH;
    const vh = typeof window !== "undefined" && window.innerHeight ? window.innerHeight : LOGICAL_HEIGHT;
    if (this.stageElement) {
      applyStageTransform(this.stageElement, vw, vh);
    }

    this.mounted = true;
    await this.goTo(this.slideIndex, this.stepIndex);
  }

  async goTo(slideIndex: number, stepIndex: number = 0): Promise<void> {
    const totalSlides = this.manifest.slides.length;
    if (totalSlides === 0) {
      return;
    }
    const clampedSlide = Math.max(0, Math.min(slideIndex, totalSlides - 1));
    const entry = this.manifest.slides[clampedSlide];
    if (!entry) {
      return;
    }
    const nextDef = this.slides[entry.file] ?? this.slides[entry.id];
    if (!nextDef) {
      return;
    }

    const container = this.stageElement ?? this.rootElement;

    if (this.activeSlideDef && this.activeSlideDef.onLeave) {
      await this.activeSlideDef.onLeave(container);
    }

    this.slideIndex = clampedSlide;
    const maxSteps = nextDef.steps ?? entry.steps ?? 0;
    this.stepIndex = Math.max(0, Math.min(stepIndex, maxSteps));
    this.activeSlideDef = nextDef;

    if (this.styleElement) {
      this.styleElement.textContent = nextDef.css ?? "";
    }
    container.innerHTML = nextDef.html;

    if (nextDef.onEnter) {
      await nextDef.onEnter(container);
    }

    for (let s = 1; s <= this.stepIndex; s++) {
      if (nextDef.onStep) {
        await nextDef.onStep(container, s);
      }
    }

    this.persistHmrState();
    this.presenterBridge.sync(this.slideIndex, this.stepIndex, entry.speakerNotes);
  }

  async next(): Promise<void> {
    const entry = this.manifest.slides[this.slideIndex];
    if (!entry) {
      return;
    }
    const currentDef = this.activeSlideDef ?? this.slides[entry.file] ?? this.slides[entry.id];
    const maxSteps = currentDef?.steps ?? entry.steps ?? 0;
    const container = this.stageElement ?? this.rootElement;

    if (this.stepIndex < maxSteps) {
      this.stepIndex += 1;
      if (currentDef?.onStep) {
        await currentDef.onStep(container, this.stepIndex);
      }
      this.persistHmrState();
      this.presenterBridge.sync(this.slideIndex, this.stepIndex, entry.speakerNotes);
      return;
    }

    if (this.slideIndex + 1 < this.manifest.slides.length) {
      await this.goTo(this.slideIndex + 1, 0);
    }
  }

  async prev(): Promise<void> {
    if (this.stepIndex > 0) {
      await this.goTo(this.slideIndex, this.stepIndex - 1);
      return;
    }
    if (this.slideIndex > 0) {
      const prevIndex = this.slideIndex - 1;
      const prevEntry = this.manifest.slides[prevIndex];
      const prevDef = prevEntry ? (this.slides[prevEntry.file] ?? this.slides[prevEntry.id]) : undefined;
      const prevSteps = prevDef?.steps ?? prevEntry?.steps ?? 0;
      await this.goTo(prevIndex, prevSteps);
    }
  }

  inspectCurrentSlide(): SlideDiagnostics {
    const container = this.stageElement ?? this.rootElement;
    return collectDiagnostics(container, this.slideIndex, this.stepIndex, this.consoleErrors);
  }

  openPresenterView(): void {
    const entry = this.manifest.slides[this.slideIndex];
    this.presenterBridge.sync(this.slideIndex, this.stepIndex, entry?.speakerNotes);
  }

  getState(): { slideIndex: number; stepIndex: number; mounted: boolean } {
    return {
      slideIndex: this.slideIndex,
      stepIndex: this.stepIndex,
      mounted: this.mounted
    };
  }

  async destroy(): Promise<void> {
    const container = this.stageElement ?? this.rootElement;
    if (this.activeSlideDef && this.activeSlideDef.onLeave) {
      await this.activeSlideDef.onLeave(container);
    }
    this.presenterBridge.close();
    this.mounted = false;
  }

  private persistHmrState(): void {
    const store = globalThis as unknown as HmrStateStore;
    store.__FOIL_HMR_STATE__ = {
      slideIndex: this.slideIndex,
      stepIndex: this.stepIndex
    };
  }
}
