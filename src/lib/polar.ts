import { Polar } from "@polar-sh/sdk";
import { env } from "cloudflare:workers";

export const polar = new Polar({
	accessToken: env.POLAR_ACCESS_TOKEN,
	server: env.POLAR_MODE === "production" ? "production" : "sandbox",
});
