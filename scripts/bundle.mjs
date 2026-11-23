import { build } from "esbuild";
import { mkdir } from "node:fs/promises";

const target = process.argv[2];
const alias = {
  "@hashly/wallet": "./packages/wallet/src/index.ts",
  "@hashly/connectors": "./packages/connectors/src/index.ts",
  "@hashly/connectors/node": "./packages/connectors/src/node.ts",
  "@hashly/market": "./packages/market/src/index.ts",
  "@hashly/license": "./packages/license/src/index.ts",
  "@hashly/pro": "./packages/pro/src/index.ts",
  "@hashly/i18n": "./packages/i18n/src/index.ts",
};

if (target === "server") {
  await mkdir("apps/server/dist", { recursive: true });
  await build({
    entryPoints: ["apps/server/src/index.ts"],
    outfile: "apps/server/dist/index.cjs",
    bundle: true,
    platform: "node",
    format: "cjs",
    alias,
    external: [],
    logLevel: "info",
  });
} else if (target === "cli") {
  await mkdir("cli/license/dist", { recursive: true });
  await build({
    entryPoints: ["cli/license/src/index.ts"],
    outfile: "cli/license/dist/index.cjs",
    bundle: true,
    platform: "node",
    format: "cjs",
    alias,
    banner: { js: "#!/usr/bin/env node" },
    logLevel: "info",
  });
} else if (target === "desktop") {
  await mkdir("apps/desktop/dist-electron", { recursive: true });
  await build({
    entryPoints: ["apps/desktop/electron/main.ts"],
    outfile: "apps/desktop/dist-electron/main.cjs",
    bundle: true,
    platform: "node",
    format: "cjs",
    alias,
    external: ["electron"],
    logLevel: "info",
  });
  await build({
    entryPoints: ["apps/desktop/electron/preload.ts"],
    outfile: "apps/desktop/dist-electron/preload.cjs",
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron"],
    logLevel: "info",
  });
} else {
  console.error("usage: bundle.mjs server|cli|desktop");
  process.exit(1);
}
