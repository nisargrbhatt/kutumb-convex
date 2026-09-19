import { can, type Permissions } from "@/domain/permission";
import { useActor } from "@/hooks/useActor";

export function useCan(perms: Permissions): boolean {
	const actor = useActor();
	return actor !== null && can(actor, perms);
}
