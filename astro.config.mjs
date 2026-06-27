import react from "@astrojs/react";
import vercel from "@astrojs/vercel";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
	integrations: [react()],
	vite: {
		plugins: [tailwindcss()],
	},
	// Static by default (prerendered to the CDN edge). Opt individual routes
	// into on-demand rendering with `export const prerender = false`.
	adapter: vercel(),
});
