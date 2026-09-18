export function isInvitationPending(
	invite: { status: string; expiresAt: Date },
	now: Date = new Date()
): boolean {
	return invite.status === "pending" && invite.expiresAt > now;
}
