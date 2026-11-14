/** Optional vars `wrangler types` doesn't emit (unset in wrangler.jsonc). */
declare namespace Cloudflare {
	interface Env {
		/** Dev only: "1" + Test Mode accepts unsigned Dodo webhooks (`dodoWebhookUnsafe`). */
		DODO_WEBHOOK_UNSAFE?: string;
	}
}
interface Env {
	DODO_WEBHOOK_UNSAFE?: string;
}
