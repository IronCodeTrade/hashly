import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("hashly", {
  version: "0.1.0",
  setProxy: (rules: string) => ipcRenderer.invoke("set-proxy", rules),
  notify: (title: string, body: string) => ipcRenderer.invoke("notify", title, body),
});
