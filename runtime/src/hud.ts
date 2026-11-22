export interface PlayerHudCallbacks {
  onPrev: () => void;
  onNext: () => void;
}

const HUD_CSS = `
.foil-hud {
  position: fixed;
  right: 20px;
  bottom: 16px;
  z-index: 9999;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 999px;
  background: rgba(18, 18, 22, 0.68);
  border: 1px solid rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(12px);
  color: #f4f4f5;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 13px;
  line-height: 1;
  user-select: none;
  opacity: 0.12;
  transform: translateY(calc(100% + 4px));
  transition: opacity 0.22s ease, transform 0.24s cubic-bezier(0.16, 1, 0.3, 1);
}
.foil-hud::before {
  content: "";
  position: absolute;
  top: -48px;
  left: -24px;
  right: -20px;
  bottom: -16px;
  z-index: -1;
}
.foil-hud:hover,
.foil-hud.is-active {
  opacity: 0.92;
  transform: translateY(0);
}
.foil-hud-btn {
  appearance: none;
  border: 1px solid transparent;
  background: transparent;
  color: #f4f4f5;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.foil-hud-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}
.foil-hud-btn.is-laser {
  background: rgba(239, 68, 68, 0.22);
  border-color: rgba(248, 113, 113, 0.65);
  color: #fecaca;
}
.foil-hud-btn.is-rec {
  background: rgba(239, 68, 68, 0.26);
  border-color: rgba(248, 113, 113, 0.8);
  color: #fecaca;
}
.foil-hud-count {
  padding: 0 6px;
  font-variant-numeric: tabular-nums;
  color: #a1a1aa;
  font-size: 12px;
  font-weight: 600;
}
.foil-hud-sep {
  width: 1px;
  height: 16px;
  background: rgba(255, 255, 255, 0.14);
}
.foil-laser-dot {
  position: fixed;
  top: 0;
  left: 0;
  width: 16px;
  height: 16px;
  margin-left: -8px;
  margin-top: -8px;
  border-radius: 999px;
  pointer-events: none;
  z-index: 10000;
  background: radial-gradient(circle, #ffffff 0%, #ef4444 45%, rgba(239, 68, 68, 0) 75%);
  box-shadow: 0 0 14px 4px rgba(239, 68, 68, 0.75);
  display: none;
}
`;

export function canRecordPresentation(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function" &&
    typeof MediaRecorder !== "undefined"
  );
}

export class PlayerHud {
  private styleEl: HTMLStyleElement | null = null;
  private hudEl: HTMLElement | null = null;
  private countEl: HTMLElement | null = null;
  private laserBtn: HTMLButtonElement | null = null;
  private recBtn: HTMLButtonElement | null = null;
  private laserDot: HTMLElement | null = null;
  private laserActive = false;
  private pointerHandler: ((event: PointerEvent) => void) | null = null;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private recChunks: BlobPart[] = [];
  private recTimer: ReturnType<typeof setInterval> | null = null;
  private recStartedAt = 0;

  mount(rootElement: HTMLElement, callbacks: PlayerHudCallbacks): void {
    const doc = rootElement.ownerDocument;
    if (!doc || typeof doc.createElement !== "function") {
      return;
    }

    const style = doc.createElement("style");
    style.setAttribute("data-foil-hud-style", "true");
    style.textContent = HUD_CSS;

    const hud = doc.createElement("div");
    hud.className = "foil-hud";
    hud.setAttribute("data-foil-hud", "true");

    const prevBtn = doc.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "foil-hud-btn";
    prevBtn.setAttribute("aria-label", "Slide anterior");
    prevBtn.textContent = "‹";
    prevBtn.addEventListener("click", () => callbacks.onPrev());

    const count = doc.createElement("span");
    count.className = "foil-hud-count";
    count.textContent = "1 / 1";

    const nextBtn = doc.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "foil-hud-btn";
    nextBtn.setAttribute("aria-label", "Próximo slide");
    nextBtn.textContent = "›";
    nextBtn.addEventListener("click", () => callbacks.onNext());

    const sep = doc.createElement("span");
    sep.className = "foil-hud-sep";

    const laserBtn = doc.createElement("button");
    laserBtn.type = "button";
    laserBtn.className = "foil-hud-btn";
    laserBtn.setAttribute("aria-label", "Alternar ponteiro laser (L)");
    laserBtn.textContent = "Laser";
    laserBtn.addEventListener("click", () => {
      this.toggleLaser();
    });

    hud.appendChild(prevBtn);
    hud.appendChild(count);
    hud.appendChild(nextBtn);
    hud.appendChild(sep);
    hud.appendChild(laserBtn);

    if (canRecordPresentation()) {
      const recBtn = doc.createElement("button");
      recBtn.type = "button";
      recBtn.className = "foil-hud-btn";
      recBtn.setAttribute("aria-label", "Gravar apresentação");
      recBtn.textContent = "Gravar";
      recBtn.addEventListener("click", () => {
        void this.toggleRecording(doc);
      });
      hud.appendChild(recBtn);
      this.recBtn = recBtn;
    }

    const dot = doc.createElement("div");
    dot.className = "foil-laser-dot";

    rootElement.appendChild(style);
    rootElement.appendChild(hud);
    rootElement.appendChild(dot);

    this.styleEl = style;
    this.hudEl = hud;
    this.countEl = count;
    this.laserBtn = laserBtn;
    this.laserDot = dot;

    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      this.pointerHandler = (event: PointerEvent) => {
        if (!this.laserActive || !this.laserDot) {
          return;
        }
        this.laserDot.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`;
      };
      window.addEventListener("pointermove", this.pointerHandler);
    }
  }

  updateCounter(slideIndex: number, totalSlides: number): void {
    if (!this.countEl) {
      return;
    }
    const safeTotal = Math.max(1, totalSlides);
    const current = Math.min(safeTotal, Math.max(1, slideIndex + 1));
    this.countEl.textContent = `${current} / ${safeTotal}`;
  }

  toggleLaser(force?: boolean): boolean {
    this.laserActive = force ?? !this.laserActive;
    if (this.laserBtn) {
      this.laserBtn.classList.toggle("is-laser", this.laserActive);
    }
    if (this.hudEl) {
      this.hudEl.classList.toggle("is-active", this.laserActive || Boolean(this.recorder));
    }
    if (this.laserDot) {
      this.laserDot.style.display = this.laserActive ? "block" : "none";
    }
    return this.laserActive;
  }

  isLaserActive(): boolean {
    return this.laserActive;
  }

  private async toggleRecording(doc: Document): Promise<void> {
    if (this.recorder && this.recorder.state !== "inactive") {
      this.stopRecording();
      return;
    }
    if (!canRecordPresentation()) {
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      this.recChunks = [];
      this.stream = stream;
      this.recorder = recorder;
      this.recStartedAt = Date.now();

      recorder.ondataavailable = (ev: BlobEvent) => {
        if (ev.data && ev.data.size > 0) {
          this.recChunks.push(ev.data);
        }
      };

      recorder.onstop = () => {
        this.finishRecording(doc, mimeType);
      };

      for (const track of stream.getVideoTracks()) {
        track.addEventListener("ended", () => {
          this.stopRecording();
        });
      }

      recorder.start(250);
      this.updateRecLabel();
      this.recTimer = setInterval(() => this.updateRecLabel(), 1000);
      if (this.recBtn) {
        this.recBtn.classList.add("is-rec");
      }
      if (this.hudEl) {
        this.hudEl.classList.add("is-active");
      }
    } catch {
      this.resetRecUi("Indisponível");
    }
  }

  private updateRecLabel(): void {
    if (!this.recBtn) {
      return;
    }
    const elapsedSec = Math.max(0, Math.floor((Date.now() - this.recStartedAt) / 1000));
    const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
    const ss = String(elapsedSec % 60).padStart(2, "0");
    this.recBtn.textContent = `REC ${mm}:${ss}`;
  }

  private stopRecording(): void {
    if (this.recorder && this.recorder.state !== "inactive") {
      this.recorder.stop();
    }
  }

  private finishRecording(doc: Document, mimeType: string): void {
    if (this.recTimer) {
      clearInterval(this.recTimer);
      this.recTimer = null;
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
    if (this.recChunks.length > 0 && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      const blob = new Blob(this.recChunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = doc.createElement("a");
      link.href = url;
      link.download = `foil-recording-${Date.now()}.webm`;
      doc.body?.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    this.recChunks = [];
    this.recorder = null;
    this.resetRecUi("Gravar");
  }

  private resetRecUi(label: string): void {
    if (this.recBtn) {
      this.recBtn.classList.remove("is-rec");
      this.recBtn.textContent = label;
    }
    if (this.hudEl) {
      this.hudEl.classList.toggle("is-active", this.laserActive);
    }
  }

  destroy(): void {
    this.toggleLaser(false);
    this.stopRecording();
    if (this.recTimer) {
      clearInterval(this.recTimer);
      this.recTimer = null;
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
    if (this.pointerHandler && typeof window !== "undefined" && typeof window.removeEventListener === "function") {
      window.removeEventListener("pointermove", this.pointerHandler);
      this.pointerHandler = null;
    }
    this.hudEl?.remove();
    this.laserDot?.remove();
    this.styleEl?.remove();
    this.hudEl = null;
    this.laserDot = null;
    this.styleEl = null;
    this.countEl = null;
    this.laserBtn = null;
    this.recBtn = null;
  }
}
