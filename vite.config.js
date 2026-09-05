import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  base: "./",
  clearScreen: false,
  server: {
    port: 5177,
    strictPort: true,
    open: !process.env.TAURI_ENV_PLATFORM,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
