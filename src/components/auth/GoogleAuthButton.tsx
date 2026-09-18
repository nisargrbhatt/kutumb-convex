import { useState } from "react";
import { usePostHog } from "@posthog/react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { GoogleIcon } from "@/components/icons/GoogleIcon";

interface GoogleAuthButtonProps {
	mode: "sign_in" | "sign_up";
	destination: string;
	errorCallbackURL: string;
}

/** Shared by `/login` and `/signup` — same OAuth call, differs only in the analytics event. */
export function GoogleAuthButton({ mode, destination, errorCallbackURL }: GoogleAuthButtonProps) {
	const posthog = usePostHog();
	const [loading, setLoading] = useState(false);

	const handleClick = async () => {
		posthog.capture(mode === "sign_in" ? "sign_in_initiated" : "sign_up_initiated", {
			provider: "google",
		});
		await authClient.signIn.social(
			{
				provider: "google",
				callbackURL: destination,
				errorCallbackURL,
			},
			{
				onRequest: () => setLoading(true),
				onResponse: () => setLoading(false),
			}
		);
	};

	return (
		<Button
			type="button"
			variant="outline"
			className="w-full gap-2"
			disabled={loading}
			onClick={handleClick}
		>
			<GoogleIcon />
			Continue with Google
		</Button>
	);
}
