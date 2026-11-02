import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./", // works at the custom domain and at weareaiforfun-hub.github.io/museumhop/
  server: { port: 5190 },
});
