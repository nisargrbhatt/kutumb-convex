import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyButton({ value, label }: { value: string; label: string }) {
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(value);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			toast.error("Couldn't copy. Select and copy manually.");
		}
	};

	return (
		<Button
			type="button"
			variant="ghost"
			size="icon-sm"
			onClick={copy}
			aria-label={`Copy ${label}`}
			title={`Copy ${label}`}
		>
			{copied ? <Check className="size-4" /> : <Copy className="size-4" />}
		</Button>
	);
}
