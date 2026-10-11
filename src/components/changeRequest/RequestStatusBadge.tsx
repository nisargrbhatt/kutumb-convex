import { Badge } from "@/components/ui/badge";
import type { ChangeRequestStatus } from "@/domain/changeRequest";

const STATUS_VARIANT: Record<
	ChangeRequestStatus,
	"default" | "secondary" | "destructive" | "outline"
> = {
	pending: "outline",
	approved: "default",
	rejected: "destructive",
	withdrawn: "secondary",
	superseded: "secondary",
};

export function RequestStatusBadge({ status }: { status: ChangeRequestStatus }) {
	return (
		<Badge variant={STATUS_VARIANT[status]} className="capitalize">
			{status}
		</Badge>
	);
}
