import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { RootLayout } from "@/components/RootLayout";

export function PaymentRequiredBanner() {
	const { data: activeOrg } = authClient.useActiveOrganization();
	const { data: organizations } = authClient.useListOrganizations();

	const goToCheckout = async () => {
		await authClient.checkout({
			slug: "org-product",
			referenceId: activeOrg?.id,
		});
	};

	return (
		<RootLayout>
			<div className="flex w-full items-center justify-center p-6 md:p-10">
				<div className="w-full max-w-sm">
					<div className={"flex flex-col gap-6"}>
						<Card>
							<CardHeader>
								<CardTitle>Trial ended</CardTitle>
								<CardDescription>Your free trial for {activeOrg?.name} has ended.</CardDescription>
							</CardHeader>
							<CardContent>
								<p className="text-sm text-muted-foreground">
									Complete payment to continue using your community. See our{" "}
									<Link to={"/"}>Pricing</Link> for details.
								</p>
							</CardContent>
							<CardFooter className="w-full flex-row gap-2">
								<Button type="button" onClick={goToCheckout} variant={"outline"}>
									Complete <ArrowRight />
								</Button>
								{organizations && organizations?.length > 0 ? (
									<Select
										items={Object.fromEntries(
											(organizations ?? []).map((org) => [org.id, org.name])
										)}
										onValueChange={async (value) => {
											if (!value) return;
											await authClient.organization.setActive({
												organizationId: value,
											});
											window.location.reload();
										}}
										defaultValue={activeOrg?.id}
									>
										<SelectTrigger className="w-full max-w-40">
											<SelectValue
												title={"Organization Switcher"}
												placeholder="Select a organization"
											/>
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												<SelectLabel>Organizations</SelectLabel>
												{organizations?.map((org) => (
													<SelectItem key={org.id} value={org.id}>
														{org.name}
													</SelectItem>
												))}
											</SelectGroup>
										</SelectContent>
									</Select>
								) : null}
							</CardFooter>
						</Card>
					</div>
				</div>
			</div>
		</RootLayout>
	);
}
