import { app, BrowserWindow, Notification, ipcMain, session, shell } from "electron";
import path from "node:path";
import { startServer } from "../../server/src/index";

const PROXY = /^(socks5|socks4|http|https):\/\/[A-Za-z0-9._:-]+$/;

async function createWindow(): Promise<void> {
  const devUrl = process.env.HASHLY_DEV_URL;
  let url = devUrl ?? "";
  if (!devUrl) {
    const staticDir = app.isPackaged
      ? path.join(process.resourcesPath, "web")
      : path.join(__dirname, "../../web/dist");
    const started = await startServer({ port: 0, host: "127.0.0.1", staticDir });
    url = `http://127.0.0.1:${started.port}`;
  }
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    backgroundColor: "#121214",
    title: "Hashly",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith("https://")) void shell.openExternal(target);
    return { action: "deny" };
  });
  await window.loadURL(url);
}

ipcMain.handle("set-proxy", async (_event, rules: string) => {
  if (!rules) {
    await session.defaultSession.setProxy({ mode: "direct" });
    return;
  }
  if (!PROXY.test(rules)) throw new Error("bad-proxy");
  await session.defaultSession.setProxy({ proxyRules: rules });
});

ipcMain.handle("notify", (_event, title: string, body: string) => {
  new Notification({ title: String(title).slice(0, 80), body: String(body).slice(0, 240) }).show();
});

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
