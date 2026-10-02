import { Building } from "lucide-react";

/** Square community glyph shared by the select-org rows and the consent org card. */
export function OrgCardIcon() {
	return (
		<div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
			<Building className="size-4" aria-hidden />
		</div>
	);
}
