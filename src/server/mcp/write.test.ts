import { describe, expect, it } from "vitest";
import { isAppError } from "@/domain/errors";
import type { ConnectionActor } from "./actor";
import { requireWrite } from "./write";

const base = { userId: "u1", organizationId: "o1", role: "member" } as const;

describe("requireWrite", () => {
	it("passes when the Connection may write", () => {
		const actor: ConnectionActor = { ...base, write: { canWrite: true } };
		expect(() => requireWrite(actor)).not.toThrow();
	});

	it.each(["connection_read_only", "org_writes_off"] as const)(
		"%s → WriteNotAllowed carrying the reason",
		(reason) => {
			const actor: ConnectionActor = { ...base, write: { canWrite: false, reason } };
			try {
				requireWrite(actor);
				expect.unreachable();
			} catch (e) {
				expect(isAppError(e)).toBe(true);
				expect(e).toMatchObject({ kind: "WriteNotAllowed", code: reason });
			}
		}
	);
});
