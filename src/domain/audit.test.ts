import { describe, expect, it } from "vitest";
import type { AuditAction } from "@/db/constants";
import { diffRows, groupHow, groupSummary } from "./audit";

const ev = (action: AuditAction, extra: Record<string, unknown> = {}) => ({
	action,
	actorRole: "owner",
	profileName: "Ravi Patel",
	counterpartName: null as string | null,
	payload: null as unknown,
	...extra,
});

describe("groupHow", () => {
	it("Change Request groups take the latest outcome; submitted alone is pending", () => {
		expect(groupHow([ev("change_request.submitted")])).toBe("pending");
		// events arrive newest first
		expect(
			groupHow([
				ev("profile.updated"),
				ev("change_request.approved"),
				ev("change_request.submitted"),
			])
		).toBe("approved");
		expect(groupHow([ev("profile.deleted"), ev("change_request.rejected")])).toBe("rejected");
		expect(groupHow([ev("change_request.withdrawn"), ev("change_request.submitted")])).toBe(
			"withdrawn"
		);
		expect(groupHow([ev("change_request.superseded")])).toBe("superseded");
	});

	it("unlinked: owner/admin → direct, member → self-edit", () => {
		expect(groupHow([ev("profile.updated", { actorRole: "admin" })])).toBe("direct");
		expect(groupHow([ev("profile.updated", { actorRole: "member" })])).toBe("self-edit");
	});
});

describe("groupSummary", () => {
	it("describes the applied change, else the request", () => {
		expect(
			groupSummary([
				ev("profile.updated", { payload: { firstName: ["Ravi", "Ravee"], city: [null, "X"] } }),
				ev("change_request.approved"),
			])
		).toBe("Updated Ravi Patel: First name, City");
		expect(groupSummary([ev("relation.added", { counterpartName: "Sita Patel" })])).toBe(
			"Added relation Ravi Patel → Sita Patel"
		);
		expect(
			groupSummary([ev("change_request.submitted", { payload: { kind: "address_add" } })])
		).toBe("Requested address add for Ravi Patel");
		// rejected carries only the reason: kind comes from the submitted event
		expect(
			groupSummary([
				ev("change_request.rejected", { payload: { reason: "dup" } }),
				ev("change_request.submitted", { payload: { kind: "address_add" } }),
			])
		).toBe("Requested address add for Ravi Patel");
	});
});

describe("diffRows", () => {
	it("[before, after] pairs become change rows, incl. Custom Field Values by label", () => {
		expect(
			diffRows({
				firstName: ["A", "B"],
				customFieldData: { def1: { label: "Gotra", change: [null, "Kashyap"] } },
			})
		).toEqual([
			{ label: "First name", before: "A", after: "B" },
			{ label: "Gotra", before: null, after: "Kashyap" },
		]);
	});

	it("snapshots become value rows, skipping ids and empty values", () => {
		expect(
			diffRows({
				id: "p1",
				userId: null,
				firstName: "A",
				customFieldData: { def1: { label: "Gotra", value: "K" } },
			})
		).toEqual([
			{ label: "First name", value: "A" },
			{ label: "Gotra", value: "K" },
		]);
	});

	it("non-objects yield nothing", () => {
		expect(diffRows(null)).toEqual([]);
	});
});
