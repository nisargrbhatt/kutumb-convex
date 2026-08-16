import { Alert, AlertDescription } from "@/components/ui/alert";
import { AUTH_COPY, OAUTH_ACCOUNT_NOT_LINKED_ERROR } from "@/lib/auth-copy";

/**
 * Renders only for the one OAuth callback failure this ticket owns copy for
 * (`requireLocalEmailVerified` blocking an implicit link, 19-auth-pages.md). Any other
 * `?error=` value is left unhandled rather than inventing unspecced copy.
 */
export function OAuthErrorAlert({ error }: { error?: string }) {
	if (error !== OAUTH_ACCOUNT_NOT_LINKED_ERROR) {
		return null;
	}

	return (
		<Alert variant="destructive">
			<AlertDescription>{AUTH_COPY.accountNotLinked}</AlertDescription>
		</Alert>
	);
}
