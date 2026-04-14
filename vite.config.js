import { defineConfig } from "vite";

const tunnelAllowedHosts = [".trycloudflare.com"];

export default defineConfig({
  server: {
    allowedHosts: tunnelAllowedHosts,
  },
  preview: {
    allowedHosts: tunnelAllowedHosts,
  },
});
