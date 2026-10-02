import { Link } from "@tanstack/react-router";
import { AuthCardShell } from "@/components/auth/AuthCardShell";
import { Button } from "@/components/ui/button";

/** Shown when the screen is opened without a valid authorization request (no/unknown client). */
export function OauthRequestError() {
	return (
		<AuthCardShell
			title="Request not found"
			description="This authorization link is invalid or has expired. Start again from your AI app."
		>
			<Button variant="outline" className="w-full" render={<Link to="/dashboard" />}>
				Go to Kutumb
			</Button>
		</AuthCardShell>
	);
}
