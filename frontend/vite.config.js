import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `npm run dev` proxies the API to the running container
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:8090" } },
});
