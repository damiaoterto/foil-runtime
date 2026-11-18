const LOCKDOWN_PRIMITIVES = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "Worker",
  "SharedWorker",
  "eval",
  "Function"
] as const;

export function createLockedDownThrower(primitiveName: string): (...args: unknown[]) => never {
  const blocked = (): never => {
    throw new Error(`Foil Security Violation: ${primitiveName} is disabled in production lockdown mode`);
  };
  return Object.freeze(blocked);
}

export function enableRuntimeLockdown(targetGlobal: Record<string, unknown> = globalThis as Record<string, unknown>): void {
  for (const name of LOCKDOWN_PRIMITIVES) {
    const blockedFn = createLockedDownThrower(name);
    try {
      Object.defineProperty(targetGlobal, name, {
        value: blockedFn,
        writable: false,
        configurable: false,
        enumerable: true
      });
    } catch {
      targetGlobal[name] = blockedFn;
    }
  }

  const nav = targetGlobal["navigator"] as Record<string, unknown> | undefined;
  if (nav && typeof nav === "object") {
    const blockedBeacon = createLockedDownThrower("navigator.sendBeacon");
    try {
      Object.defineProperty(nav, "sendBeacon", {
        value: blockedBeacon,
        writable: false,
        configurable: false,
        enumerable: true
      });
    } catch {
      nav["sendBeacon"] = blockedBeacon;
    }
  }
}

export function getInlineRuntimeLockdownScript(): string {
  return `(function(){var p=["fetch","XMLHttpRequest","WebSocket","EventSource","Worker","SharedWorker","eval","Function"];for(var i=0;i<p.length;i++){(function(n){var b=Object.freeze(function(){throw new Error("Foil Security Violation: "+n+" is disabled in production lockdown mode");});try{Object.defineProperty(window,n,{value:b,writable:false,configurable:false});}catch(e){window[n]=b;}})(p[i]);}if(window.navigator){var sb=Object.freeze(function(){throw new Error("Foil Security Violation: navigator.sendBeacon is disabled in production lockdown mode");});try{Object.defineProperty(window.navigator,"sendBeacon",{value:sb,writable:false,configurable:false});}catch(e){window.navigator.sendBeacon=sb;}}})();`;
}
