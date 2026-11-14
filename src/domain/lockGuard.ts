import { APIError } from "better-auth/api";
import type { LockReason } from "./billing";
import { lockAllowsRoleChange } from "./lock";

/** `APIError` body code for an org action refused under Lock. */
export const ORG_LOCKED_CODE = "ORGANIZATION_LOCKED";

/**
 * better-auth org hook guards under Lock (spec: Lock enforcement): invite, update org and role
 * change (except ownership transfer) are refused. Leave, remove, cancel invite, delete, set active
 * and accepting an invite stay open.
 */
export function makeLockGuard(
	loadLock: (organizationId: string) => Promise<LockReason | undefined>
) {
	const assertOpen = async (organizationId: string) => {
		const reason = await loadLock(organizationId);
		if (reason) {
			throw new APIError("FORBIDDEN", {
				code: ORG_LOCKED_CODE,
				message: "This organization is locked. An owner must subscribe first.",
			});
		}
	};
	return {
		invite: ({ organization }: { organization: { id: string } }) => assertOpen(organization.id),
		updateOrganization: ({ member }: { member: { organizationId: string } }) =>
			assertOpen(member.organizationId),
		updateMemberRole: async ({
			member,
			newRole,
			organization,
		}: {
			member: { role: string };
			newRole: string;
			organization: { id: string };
		}) => {
			if (lockAllowsRoleChange({ currentRole: member.role, newRole })) return;
			await assertOpen(organization.id);
		},
	};
}
