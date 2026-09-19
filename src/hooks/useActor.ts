import { useRouteContext } from "@tanstack/react-router";
import type { Actor } from "@/domain/permission";

export function useActor(): Actor | null {
	const { session, member } = useRouteContext({ from: "__root__" });
	const organizationId = session?.session?.activeOrganizationId;

	if (!session || !member || typeof organizationId !== "string") {
		return null;
	}

	return { userId: session.user.id, organizationId, role: member.role };
}
