import { useState } from "react";
import { Plug } from "lucide-react";
import { ConnectAiClientDrawer } from "@/components/ai/ConnectAiClientDrawer";
import { Button } from "@/components/ui/button";

/** Opens the connect drawer (MCP URL + per-client setup). */
export function ConnectAiClientButton({
	variant = "default",
}: {
	variant?: "default" | "outline";
}) {
	const [open, setOpen] = useState(false);

	return (
		<>
			<Button size="sm" variant={variant} onClick={() => setOpen(true)}>
				<Plug className="size-4" />
				Connect AI client
			</Button>
			<ConnectAiClientDrawer open={open} onOpenChange={setOpen} />
		</>
	);
}
