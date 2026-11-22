import { describe, expect, test } from "bun:test";
import {
  computeProportionalScale,
  detectSlideOverflows,
  enableRuntimeLockdown,
  FoilDeck,
  PlayerHud,
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

describe("@foil-engine/runtime", () => {
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

  test("FoilDeck skips steps when slide defines no onStep hook", async () => {
    delete (globalThis as Record<string, unknown>).__FOIL_HMR_STATE__;

    const manifest: DeckManifest = {
      title: "No OnStep Test",
      aspectRatio: "16:9",
      width: 1920,
      height: 1080,
      theme: "default",
      slides: [
        { id: "s1", file: "src/slides/01.js", steps: 2 },
        { id: "s2", file: "src/slides/02.js", steps: 0 }
      ]
    };

    const slides: Record<string, SlideDefinition> = {
      "src/slides/01.js": { html: "<section>Slide 1</section>" },
      "src/slides/02.js": { html: "<section>Slide 2</section>" }
    };

    const deck = new FoilDeck(manifest, slides, createMockElement());
    await deck.mount();
    expect(deck.getState().slideIndex).toBe(0);

    await deck.next();
    expect(deck.getState().slideIndex).toBe(1);
    expect(deck.getState().stepIndex).toBe(0);

    await deck.destroy();
  });

  test("PlayerHud mounts controls, fires prev/next, updates counter, toggles laser, and cleans up", () => {
    const appended: Array<Record<string, unknown>> = [];
    const makeNode = (tag: string) => {
      const listeners: Record<string, Array<() => void>> = {};
      const classes = new Set<string>();
      const node: Record<string, unknown> = {
        tagName: tag.toUpperCase(),
        className: "",
        textContent: "",
        style: {} as Record<string, string>,
        children: [] as Array<Record<string, unknown>>,
        classList: {
          toggle(cls: string, force?: boolean) {
            const next = force ?? !classes.has(cls);
            if (next) classes.add(cls);
            else classes.delete(cls);
            return next;
          },
          contains(cls: string) {
            return classes.has(cls);
          }
        },
        setAttribute() {},
        appendChild(child: Record<string, unknown>) {
          (node.children as Array<Record<string, unknown>>).push(child);
          return child;
        },
        addEventListener(evt: string, fn: () => void) {
          listeners[evt] = listeners[evt] ?? [];
          listeners[evt].push(fn);
        },
        click() {
          for (const fn of listeners["click"] ?? []) fn();
        },
        remove() {
          node.removed = true;
        }
      };
      return node;
    };

    const root = {
      ownerDocument: {
        createElement(tag: string) {
          return makeNode(tag);
        }
      },
      appendChild(child: Record<string, unknown>) {
        appended.push(child);
        return child;
      }
    } as unknown as HTMLElement;

    let prevCalls = 0;
    let nextCalls = 0;
    const hud = new PlayerHud();
    hud.mount(root, {
      onPrev: () => {
        prevCalls += 1;
      },
      onNext: () => {
        nextCalls += 1;
      }
    });

    expect(appended.length).toBe(3);
    const hudEl = appended[1]!;
    const children = hudEl.children as Array<Record<string, unknown> & { click?: () => void }>;
    children[0]!.click?.();
    children[2]!.click?.();
    expect(prevCalls).toBe(1);
    expect(nextCalls).toBe(1);

    hud.updateCounter(2, 8);
    expect(children[1]!.textContent).toBe("3 / 8");

    expect(hud.toggleLaser()).toBe(true);
    expect((appended[2]!.style as Record<string, string>).display).toBe("block");
    expect(hud.toggleLaser()).toBe(false);
    expect((appended[2]!.style as Record<string, string>).display).toBe("none");

    hud.destroy();
    expect(appended[0]!.removed).toBe(true);
    expect(appended[1]!.removed).toBe(true);
    expect(appended[2]!.removed).toBe(true);
  });
});
