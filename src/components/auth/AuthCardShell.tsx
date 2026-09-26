import type { ReactNode } from "react";
import { RootLayout } from "@/components/RootLayout";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { FieldDescription } from "@/components/ui/field";

interface AuthCardShellProps {
	title: ReactNode;
	description?: ReactNode;
	/** Rendered centered under the card body (e.g. "Back to sign in"). */
	footer?: ReactNode;
	children: ReactNode;
}

/** Shell for /login, /signup, /forgot-password, /reset-password: RootLayout › centered card. */
export function AuthCardShell({ title, description, footer, children }: AuthCardShellProps) {
	return (
		<RootLayout>
			<div className="flex h-full w-full items-center justify-center px-4 py-10">
				<Card className="w-full max-w-sm">
					<CardHeader>
						<CardTitle className="text-lg md:text-xl">{title}</CardTitle>
						{description ? (
							<CardDescription className="text-xs md:text-sm">{description}</CardDescription>
						) : null}
					</CardHeader>
					<CardContent>{children}</CardContent>
					{footer ? (
						<CardFooter>
							<FieldDescription className="w-full text-center">{footer}</FieldDescription>
						</CardFooter>
					) : null}
				</Card>
			</div>
		</RootLayout>
	);
}
