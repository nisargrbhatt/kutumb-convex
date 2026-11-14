import { env } from "cloudflare:workers";
import DodoPayments from "dodopayments";

type DodoEnv = Pick<
	Env,
	"DODO_PAYMENTS_API_KEY" | "DODO_PAYMENTS_WEBHOOK_KEY" | "DODO_PAYMENTS_ENVIRONMENT"
>;

/** Dodo client. Build one per request (Workers: no module-level env-bound clients). */
export function createDodo(e: DodoEnv = env): DodoPayments {
	const environment = e.DODO_PAYMENTS_ENVIRONMENT;
	if (environment !== "test_mode" && environment !== "live_mode") {
		throw new Error(
			`DODO_PAYMENTS_ENVIRONMENT must be test_mode or live_mode, got "${environment}"`
		);
	}
	return new DodoPayments({
		bearerToken: e.DODO_PAYMENTS_API_KEY,
		webhookKey: e.DODO_PAYMENTS_WEBHOOK_KEY,
		environment,
	});
}

/**
 * Dev only: accept unsigned webhooks (`dodo wh trigger`). Needs Test Mode AND an explicit
 * `DODO_WEBHOOK_UNSAFE=1`; never on in live mode.
 */
export const dodoWebhookUnsafe = (
	e: Partial<Pick<Env, "DODO_PAYMENTS_ENVIRONMENT" | "DODO_WEBHOOK_UNSAFE">> = env
) => e.DODO_PAYMENTS_ENVIRONMENT === "test_mode" && e.DODO_WEBHOOK_UNSAFE === "1";

/** Dodo product id of the single `Standard` plan. */
export const dodoProductId = (e: Pick<Env, "DODO_PRODUCT_ID"> = env) => e.DODO_PRODUCT_ID;

/** Public app origin (`BETTER_AUTH_URL`): base of Dodo return URLs. */
export const appUrl = (e: Pick<Env, "BETTER_AUTH_URL"> = env) => e.BETTER_AUTH_URL;
