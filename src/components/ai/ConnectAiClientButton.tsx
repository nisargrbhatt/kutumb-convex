import { Plug } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Opens the connect drawer (slice 16). Stubbed until then. */
export function ConnectAiClientButton({
	variant = "default",
}: {
	variant?: "default" | "outline";
}) {
	return (
		<Button size="sm" variant={variant} disabled title="Coming soon">
			<Plug className="size-4" />
			Connect AI client
		</Button>
	);
}
