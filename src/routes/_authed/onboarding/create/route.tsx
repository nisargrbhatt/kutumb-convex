import { createFileRoute } from "@tanstack/react-router";
import { GalleryVerticalEnd } from "lucide-react";
import { OnboardingForm } from "./-components/OnboardingForm";
import { RootLayout } from "@/components/RootLayout";

export const Route = createFileRoute("/_authed/onboarding/create")({
	component: RouteComponent,
});

function RouteComponent() {
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
					<OnboardingForm />
				</div>
			</div>
		</RootLayout>
	);
}
