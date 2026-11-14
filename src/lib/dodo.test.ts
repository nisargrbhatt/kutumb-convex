import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

const { dodoWebhookUnsafe } = await import("./dodo");

describe("dodoWebhookUnsafe (dev-only unsigned webhooks)", () => {
	it("only in test_mode with DODO_WEBHOOK_UNSAFE=1", () => {
		const on = { DODO_PAYMENTS_ENVIRONMENT: "test_mode", DODO_WEBHOOK_UNSAFE: "1" };
		expect(dodoWebhookUnsafe(on)).toBe(true);
		expect(dodoWebhookUnsafe({ ...on, DODO_PAYMENTS_ENVIRONMENT: "live_mode" })).toBe(false);
		expect(dodoWebhookUnsafe({ ...on, DODO_WEBHOOK_UNSAFE: "true" })).toBe(false);
		expect(dodoWebhookUnsafe({ DODO_PAYMENTS_ENVIRONMENT: "test_mode" })).toBe(false);
	});
});
