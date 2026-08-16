import { useEffect, useState } from "react";
import { Mail, X } from "lucide-react";
import { usePostHog } from "@posthog/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

const DISMISSED_KEY = "kutumb:verify-email-nag-dismissed";
const RESEND_COOLDOWN_SECONDS = 60;

export function VerifyEmailNag() {
	const posthog = usePostHog();
	const { data: session } = authClient.useSession();
	const [dismissed, setDismissed] = useState(
		() => typeof window !== "undefined" && window.sessionStorage.getItem(DISMISSED_KEY) === "1"
	);
	const [cooldown, setCooldown] = useState(0);

	useEffect(() => {
		if (cooldown === 0) return;
		const interval = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
		return () => clearInterval(interval);
	}, [cooldown]);

	if (!session || session.user.emailVerified !== false || dismissed) return null;

	const handleDismiss = () => {
		window.sessionStorage.setItem(DISMISSED_KEY, "1");
		setDismissed(true);
	};

	const handleResend = async () => {
		const { error } = await authClient.sendVerificationEmail({ email: session.user.email });
		if (error) {
			toast.error("Failed to send verification email", { description: "Please try again later." });
			return;
		}
		posthog.capture("verification_email_resent");
		setCooldown(RESEND_COOLDOWN_SECONDS);
		toast.success("Verification email sent");
	};

	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-muted px-4 py-2 text-sm">
			<div className="flex min-w-0 flex-1 items-center gap-2">
				<Mail className="size-4 shrink-0" />
				<span>Verify your email to secure your account.</span>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				<Button size="sm" variant="outline" disabled={cooldown > 0} onClick={handleResend}>
					{cooldown > 0 ? `Resend (${cooldown}s)` : "Resend"}
				</Button>
				<Button size="icon-sm" variant="ghost" onClick={handleDismiss} aria-label="Dismiss">
					<X />
				</Button>
			</div>
		</div>
	);
}
