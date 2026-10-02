import { useState } from "react";
import { toast } from "sonner";
import { oauthRedirectUrl } from "@/domain/mcpOauth";

type StepResult = { data?: unknown; error?: { message?: string } | null };

/**
 * Runs one OAuth screen action (`continue` / `consent`) and follows the redirect it returns.
 * Toasts on failure — including a thrown network error — and always releases `pending`, except
 * after a successful redirect (the page is leaving).
 */
export function useOauthStep() {
	const [pending, setPending] = useState(false);

	const run = async (step: () => Promise<StepResult>, failure: string) => {
		setPending(true);
		try {
			const { data, error } = await step();
			const url = oauthRedirectUrl(data);
			if (!error && url) {
				window.location.assign(url);
				return;
			}
			toast.error(failure, { description: error?.message });
		} catch {
			toast.error(failure);
		}
		setPending(false);
	};

	return { pending, setPending, run };
}
