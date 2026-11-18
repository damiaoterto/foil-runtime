export interface PresenterSyncPayload {
  type: "presenter_sync";
  slide_index: number;
  step_index: number;
  speaker_notes?: string;
}

export class PresenterBridge {
  private channel: BroadcastChannel | null = null;
  private listeners: Array<(payload: PresenterSyncPayload) => void> = [];

  constructor(channelName: string = "foil-presenter") {
    if (typeof BroadcastChannel !== "undefined") {
      try {
        this.channel = new BroadcastChannel(channelName);
        this.channel.onmessage = (event: MessageEvent) => {
          const data = event.data as PresenterSyncPayload | undefined;
          if (data && data.type === "presenter_sync") {
            for (const listener of this.listeners) {
              listener(data);
            }
          }
        };
      } catch {
        this.channel = null;
      }
    }
  }

  sync(slideIndex: number, stepIndex: number, speakerNotes?: string): void {
    const ipcPayload = JSON.stringify({
      type: "presenter_sync",
      slide_index: slideIndex,
      step_index: stepIndex
    });

    const g = globalThis as unknown as {
      ipc?: { postMessage?: (msg: string) => void };
      parent?: { postMessage?: (msg: unknown, targetOrigin: string) => void };
    };

    if (g.ipc && typeof g.ipc.postMessage === "function") {
      g.ipc.postMessage(ipcPayload);
    }

    const broadcastPayload: PresenterSyncPayload = {
      type: "presenter_sync",
      slide_index: slideIndex,
      step_index: stepIndex,
      speaker_notes: speakerNotes
    };

    if (this.channel) {
      this.channel.postMessage(broadcastPayload);
    }

    if (g.parent && g.parent !== (globalThis as unknown) && typeof g.parent.postMessage === "function") {
      try {
        g.parent.postMessage(broadcastPayload, "*");
      } catch {
        return;
      }
    }
  }

  onSync(callback: (payload: PresenterSyncPayload) => void): void {
    this.listeners.push(callback);
  }

  close(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.listeners = [];
  }
}
