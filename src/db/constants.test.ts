import { describe, expect, it } from "vitest";
import { auditActionsInCategory } from "./constants";

describe("auditActionsInCategory", () => {
	it("groups Audit Actions by filter category", () => {
		expect(auditActionsInCategory("profile")).toEqual([
			"profile.created",
			"profile.updated",
			"profile.activated",
			"profile.deactivated",
			"profile.reactivated",
			"profile.reassigned",
			"profile.deleted",
		]);
		expect(auditActionsInCategory("relation")).toEqual(["relation.added", "relation.removed"]);
		expect(auditActionsInCategory("address")).toEqual([
			"address.added",
			"address.updated",
			"address.removed",
		]);
		expect(auditActionsInCategory("request")).toEqual([
			"change_request.submitted",
			"change_request.approved",
			"change_request.rejected",
			"change_request.withdrawn",
			"change_request.superseded",
		]);
	});
});
