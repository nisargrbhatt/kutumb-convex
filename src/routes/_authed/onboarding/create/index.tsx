import { createFileRoute } from "@tanstack/react-router";
import { GalleryVerticalEnd, Lock } from "lucide-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { OnboardingForm } from "./-components/OnboardingForm";
import { RootLayout } from "@/components/RootLayout";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getMyOrganizationCountQuery } from "@/api/organization";
import { canJoinOrganization, LIMIT_COPY } from "@/lib/limits";

export const Route = createFileRoute("/_authed/onboarding/create/")({
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(getMyOrganizationCountQuery());
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { data } = useSuspenseQuery(getMyOrganizationCountQuery());
	const atCap = !canJoinOrganization(data.count);

	return (
		<RootLayout>
			<div className="flex flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
				<div className="flex w-full max-w-sm flex-col gap-6">
					<Route.Link to="/" className="flex items-center gap-2 self-center font-medium">
						<div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
							<GalleryVerticalEnd className="size-4" />
						</div>
						Kutumb
					</Route.Link>
					<OnboardingForm
						disabled={atCap}
						titleAdornment={
							<Badge variant={atCap ? "destructive" : "secondary"} className="font-mono">
								{data.count}/{data.limit}
							</Badge>
						}
						beforeForm={
							atCap ? (
								<Alert variant="destructive" className="mb-4">
									<Lock />
									<AlertTitle>{LIMIT_COPY.orgCreate.title}</AlertTitle>
									<AlertDescription>{LIMIT_COPY.orgCreate.description}</AlertDescription>
								</Alert>
							) : null
						}
					/>
				</div>
			</div>
		</RootLayout>
	);
}
