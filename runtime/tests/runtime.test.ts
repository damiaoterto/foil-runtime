import { describe, expect, test } from "bun:test";
import {
  computeProportionalScale,
  detectSlideOverflows,
  enableRuntimeLockdown,
  FoilDeck,
  type DeckManifest,
  type SlideDefinition
} from "../src/index.ts";

function createMockElement(bounds = { top: 0, left: 0, right: 1920, bottom: 1080, width: 1920, height: 1080 }): HTMLElement {
  let htmlContent = "";
  const children: HTMLElement[] = [];
  const styleObj: Record<string, string> = {};

  const mock = {
    tagName: "DIV",
    id: "stage",
    className: "foil-stage",
    style: styleObj,
    dataset: {} as Record<string, string>,
    get innerHTML() {
      return htmlContent;
    },
    set innerHTML(val: string) {
      htmlContent = val;
    },
    appendChild(child: HTMLElement) {
      children.push(child);
      return child;
    },
    getBoundingClientRect() {
      return bounds;
    },
    querySelectorAll(selector: string) {
      if (selector === "*") {
        return children;
      }
      return [];
    }
  };

  return mock as unknown as HTMLElement;
}

describe("@foil/runtime", () => {
  test("computeProportionalScale maintains 16:9 1920x1080 aspect ratio without overflow", () => {
    expect(computeProportionalScale(1920, 1080)).toBe(1);
    expect(computeProportionalScale(960, 540)).toBe(0.5);
    expect(computeProportionalScale(1920, 540)).toBe(0.5);
    expect(computeProportionalScale(3840, 2160)).toBe(2);
  });

  test("enableRuntimeLockdown blocks and freezes network and code execution primitives", () => {
    const sandboxGlobal: Record<string, unknown> = {
      fetch: () => "ok",
      XMLHttpRequest: function () {},
      WebSocket: function () {},
      EventSource: function () {},
      Worker: function () {},
      SharedWorker: function () {},
      eval: () => {},
      Function: function () {},
      navigator: {
        sendBeacon: () => true
      }
    };

    enableRuntimeLockdown(sandboxGlobal);

    for (const primitive of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "Worker", "SharedWorker", "eval", "Function"]) {
      const fn = sandboxGlobal[primitive] as () => void;
      expect(() => fn()).toThrow(/Foil Security Violation/);
      expect(Object.isFrozen(fn)).toBe(true);
    }

    const nav = sandboxGlobal["navigator"] as { sendBeacon: () => void };
    expect(() => nav.sendBeacon()).toThrow(/Foil Security Violation/);
  });

  test("FoilDeck executes slide lifecycle (onEnter -> onStep -> onLeave) and preserves HMR state", async () => {
    const events: string[] = [];
    const manifest: DeckManifest = {
      title: "Lifecycle Test",
      aspectRatio: "16:9",
      width: 1920,
      height: 1080,
      theme: "default",
      slides: [
        { id: "s1", file: "src/slides/01.js", steps: 2 },
        { id: "s2", file: "src/slides/02.js", steps: 1 }
      ]
    };

    const slides: Record<string, SlideDefinition> = {
      "src/slides/01.js": {
        html: "<section>Slide 1</section>",
        steps: 2,
        onEnter() {
          events.push("enter:s1");
        },
        onStep(_root, step) {
          events.push(`step:s1:${step}`);
        },
        onLeave() {
          events.push("leave:s1");
        }
      },
      "src/slides/02.js": {
        html: "<section>Slide 2</section>",
        steps: 1,
        onEnter() {
          events.push("enter:s2");
        },
        onStep(_root, step) {
          events.push(`step:s2:${step}`);
        },
        onLeave() {
          events.push("leave:s2");
        }
      }
    };

    const root = createMockElement();
    const deck = new FoilDeck(manifest, slides, root);
    await deck.mount();
    expect(events).toEqual(["enter:s1"]);

    await deck.next();
    expect(events).toEqual(["enter:s1", "step:s1:1"]);

    await deck.next();
    expect(events).toEqual(["enter:s1", "step:s1:1", "step:s1:2"]);

    await deck.next();
    expect(events).toEqual(["enter:s1", "step:s1:1", "step:s1:2", "leave:s1", "enter:s2"]);
    expect(deck.getState().slideIndex).toBe(1);
    expect(deck.getState().stepIndex).toBe(0);

    const hmrReloadedDeck = new FoilDeck(manifest, slides, createMockElement());
    expect(hmrReloadedDeck.getState().slideIndex).toBe(1);

    await deck.destroy();
  });

  test("detectSlideOverflows reports elements exceeding 1920x1080 logical canvas", () => {
    const stage = createMockElement();
    const overflowingChild = {
      tagName: "DIV",
      id: "bad-card",
      className: "metric-card",
      getBoundingClientRect() {
        return { top: 100, left: 200, right: 2150, bottom: 1120, width: 1950, height: 1020 };
      }
    } as unknown as HTMLElement;

    stage.appendChild(overflowingChild);
    const overflows = detectSlideOverflows(stage);
    expect(overflows.length).toBe(1);
    expect(overflows[0]?.selector).toBe("div#bad-card.metric-card");
    expect(overflows[0]?.bounds.right).toBe(2150);
    expect(overflows[0]?.bounds.bottom).toBe(1120);
  });
});
