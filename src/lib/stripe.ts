import Stripe from "stripe";
import { env } from "cloudflare:workers";

export const stripe = new Stripe(env.STRIPE_SECRET_KEY);
