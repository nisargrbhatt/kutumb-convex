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
		<div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
			<div className="w-full max-w-sm">
				<div className={"flex flex-col gap-6"}>
					<Card>
						<CardHeader>
							<CardTitle>Payment pending</CardTitle>
							<CardDescription>Payment is pending for {activeOrg?.name}</CardDescription>
						</CardHeader>
						<CardContent>
							<p className="text-sm text-muted-foreground">
								We have 7 days free trial period. Then we will start charging money according to our{" "}
								<Link to={"/"}>Pricing</Link>.
							</p>
						</CardContent>
						<CardFooter className="w-full flex-row gap-2">
							<Button type="button" onClick={goToCheckout} variant={"outline"}>
								Complete <ArrowRight />
							</Button>
							{organizations && organizations?.length > 0 ? (
								<Select
									onValueChange={async (value) => {
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
	);
}
