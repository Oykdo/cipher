export {};

declare global {
  interface Window {
    electron?: {
      getAppPath?: () => Promise<string>;
      backupPassword?: {
        has: (username: string) => Promise<boolean>;
        get: (username: string) => Promise<{ exists: boolean; password?: string; error?: string }>;
        set: (username: string, password: string) => Promise<{ ok: boolean }>;
        clear: (username: string) => Promise<{ ok: boolean }>;
      };
      platform?: string;
      versions?: {
        node: string;
        chrome: string;
        electron: string;
      };
    };
  }
}
