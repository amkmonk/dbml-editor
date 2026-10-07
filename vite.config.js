import { defineConfig } from "vite";

// Vite только собирает интерфейс для Tauri: dev-сервер для `npm run dev`, dist/ для сборки пакетов.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  base: "./",
  clearScreen: false,
  server: {
    port: 5177,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**", "**/release/**"],
    },
  },
});
