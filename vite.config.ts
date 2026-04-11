import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import "dotenv/config";

const posthogHost = process.env.VITE_PUBLIC_POSTHOG_HOST;

const config = defineConfig({
	plugins: [
		devtools(),
		cloudflare({ viteEnvironment: { name: "ssr" } }),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
	server: {
		allowedHosts: [".trycloudflare.com"],
		proxy: posthogHost
			? {
					"/ingest": {
						target: posthogHost,
						changeOrigin: true,
						rewrite: (path) => path.replace(/^\/ingest/, ""),
						secure: false,
					},
				}
			: undefined,
	},
	resolve: {
		tsconfigPaths: true,
	},
});

export default config;
