export {};

declare global {
  interface Window {
    hashly?: {
      version: string;
      setProxy: (rules: string) => Promise<void>;
      notify: (title: string, body: string) => Promise<void>;
    };
  }
}
