declare module 'electron' {
  export const app: {
    whenReady(): Promise<void>;
    on(event: string, listener: () => void): void;
    quit(): void;
  };

  export class BrowserWindow {
    constructor(options: Record<string, unknown>);
    loadFile(path: string): void;
    on(event: string, listener: () => void): void;
    isVisible(): boolean;
    hide(): void;
    show(): void;
    focus(): void;
    setSize(width: number, height: number): void;
  }

  export const globalShortcut: {
    register(accelerator: string, callback: () => void): void;
    unregisterAll(): void;
  };

  export const ipcMain: {
    handle(channel: string, listener: (...args: any[]) => unknown): void;
  };

  export const contextBridge: {
    exposeInMainWorld(key: string, api: Record<string, unknown>): void;
  };

  export const ipcRenderer: {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  };

  export const shell: {
    openExternal(url: string): Promise<void>;
  };

  export const clipboard: {
    writeText(text: string): void;
  };
}
