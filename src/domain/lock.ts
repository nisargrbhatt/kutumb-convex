import { billingAccess, type LockReason, type OrgBillingRow } from "./billing";
import { isOwnerRole } from "./permission";

/** Path of the lock screen (outside `_community`). */
export const LOCKED_PATH = "/locked";

/**
 * Why the org is locked right now, or `undefined` when open (spec: Lock enforcement). No
 * `orgBilling` row is default-deny: every org gets one at create.
 */
export function orgLockReason(
	row: OrgBillingRow | null | undefined,
	now: Date
): LockReason | undefined {
	if (!row) return "trial_ended";
	return billingAccess(row, now).lockReason;
}

/**
 * Under Lock only ownership transfer may change roles: the change grants or removes `owner`
 * (better-auth already limits that to owners).
 */
export const lockAllowsRoleChange = ({
	currentRole,
	newRole,
}: {
	currentRole: string;
	newRole: string;
}) => isOwnerRole(currentRole) || isOwnerRole(newRole);

const LOCK_REASON_TEXT: Record<LockReason, string> = {
	trial_ended: "its free trial has ended",
	payment_failed: "its last payment failed",
	canceled: "its subscription ended",
};

/** MCP tool-call error on a locked org: an AI Client relays it; no retry loop. */
export const orgLockedToolText = ({
	orgName,
	reason,
	appOrigin,
}: {
	orgName: string;
	reason: LockReason;
	appOrigin: string;
}) =>
	`OrgLocked (${reason}): "${orgName}" is locked: ${LOCK_REASON_TEXT[reason]}. Its data is safe. Tell the user an owner must subscribe at ${appOrigin}${LOCKED_PATH}; retrying won't help.`;
