// Throwaway Dodo Test Mode probe (ticket 11). Never merged.
// Reads DODO_PAYMENTS_API_KEY + PROBE_EMAIL from .dev.vars. Test mode only. Writes results to
// .scratch/billing/probe/out.json. Creates 2 customers + 1 subscription; deletes nothing.
import { readFileSync, writeFileSync } from "node:fs";

const vars = Object.fromEntries(
	readFileSync(".dev.vars", "utf8")
		.split("\n")
		.map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/))
		.filter(Boolean)
		.map((m) => [m[1], m[2]])
);
const KEY = vars.DODO_PAYMENTS_API_KEY;
const EMAIL = vars.PROBE_EMAIL;
if (!KEY || !EMAIL) throw new Error("set DODO_PAYMENTS_API_KEY and PROBE_EMAIL in .dev.vars");
const BASE = "https://test.dodopayments.com";
const PRODUCT = "pdt_0NrRhQONNdCc90vSRvBEo";

const log = [];
async function call(label, method, path, body) {
	const res = await fetch(BASE + path, {
		method,
		headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
		body: body ? JSON.stringify(body) : undefined,
	});
	const text = await res.text();
	let json;
	try {
		json = JSON.parse(text);
	} catch {
		json = text;
	}
	log.push({ label, method, path, body, status: res.status, response: json });
	console.log(`${res.status} ${label}`);
	return json;
}

const billing = { country: "US", state: "CA", city: "San Francisco", street: "1 Test St", zipcode: "94105" };

// (4) product settings: trial / card-optional / period fields
await call("product", "GET", `/products/${PRODUCT}`);

// (2) two customers, same email
const c1 = await call("customer A", "POST", "/customers", { email: EMAIL, name: "Probe Org A" });
const c2 = await call("customer B (same email)", "POST", "/customers", {
	email: EMAIL,
	name: "Probe Org B",
});
await call("list customers by email", "GET", `/customers?email=${encodeURIComponent(EMAIL)}`);

// (1) card-less trial sub, server-side, no checkout visit
const customerId = c1?.customer_id;
if (customerId) {
	const sub = await call("subscription create (server-side, no payment link)", "POST", "/subscriptions", {
		customer: { customer_id: customerId },
		product_id: PRODUCT,
		quantity: 1,
		billing,
		payment_link: false,
		metadata: { organizationId: "probe-org-a" },
	});
	if (sub?.subscription_id) {
		await call("subscription get", "GET", `/subscriptions/${sub.subscription_id}`);
	}
}

writeFileSync(".scratch/billing/probe/out.json", JSON.stringify(log, null, 2));
console.log("wrote .scratch/billing/probe/out.json", { c1: c1?.customer_id, c2: c2?.customer_id });
