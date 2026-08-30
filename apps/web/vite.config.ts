import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import packageJson from "./package.json";

export default defineConfig(({ mode }) => {
  const buildIdentifier = loadEnv(mode, ".", "VITE_").VITE_APP_BUILD_ID || packageJson.version;

  return {
    define: {
      __APP_BUILD_ID__: JSON.stringify(buildIdentifier)
    },
    plugins: [
      react(),
      VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["favicon.svg", "icons/icon.svg"],
      manifest: {
        name: "Inspection PWA",
        short_name: "Inspection",
        description: "Offline-first field inspection application",
        theme_color: "#174e5f",
        background_color: "#f7faf8",
        display: "standalone",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/icons/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
        navigateFallback: "/index.html",
        // Accepted evidence is an authenticated binary API navigation, not a
        // PWA route. Without this exclusion Workbox returns index.html when a
        // user opens a "View accepted photo" link in a new tab.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: []
      }
      })
    ]
  };
});
