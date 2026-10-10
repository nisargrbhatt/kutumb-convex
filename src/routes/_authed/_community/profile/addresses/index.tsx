import { PageHeader } from "@/components/CommunityLayout/PageHeader";
import { AddAddressButton, AddressActions } from "@/components/address/AddressActions";
import { myAddressesQuery } from "@/queries/communityAddress";
import { myProfileQuery } from "@/queries/communityProfile";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { MapPinOff } from "lucide-react";

export const Route = createFileRoute("/_authed/_community/profile/addresses/")({
	loader: async ({ context }) => {
		await Promise.all([
			context.queryClient.ensureQueryData(myAddressesQuery(context.organizationId)),
			context.queryClient.ensureQueryData(myProfileQuery(context.organizationId)),
		]);
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { organizationId: orgId } = Route.useRouteContext();
	const { data: addresses } = useSuspenseQuery(myAddressesQuery(orgId));
	const { data: profile } = useSuspenseQuery(myProfileQuery(orgId));

	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 p-2">
			<PageHeader
				crumbs={[{ label: "Profile", to: "/profile/info" }, { label: "Addresses" }]}
				title="Addresses"
				description="Manage your residential, work, and other addresses."
				actions={
					profile ? (
						<AddAddressButton
							profileId={profile.id}
							description="Add your home, work or other address."
						/>
					) : null
				}
			/>

			<div className="flex w-full flex-col gap-6">
				<div className="w-full overflow-x-auto rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Type</TableHead>
								<TableHead>Line 1</TableHead>
								<TableHead className="hidden lg:table-cell">Line 2</TableHead>
								<TableHead className="hidden sm:table-cell">City</TableHead>
								<TableHead className="hidden md:table-cell">State</TableHead>
								<TableHead className="hidden lg:table-cell">Country</TableHead>
								<TableHead className="hidden md:table-cell">Postal Code</TableHead>
								<TableHead className="hidden lg:table-cell">Digipin</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{addresses.length === 0 ? (
								<TableRow>
									<TableCell colSpan={9} className="h-32">
										<div className="flex flex-col items-center justify-center gap-2 text-center text-muted-foreground">
											<MapPinOff className="size-8 text-muted-foreground/50" />
											<p>
												{profile
													? "No addresses found."
													: "Create your profile to start adding addresses."}
											</p>
										</div>
									</TableCell>
								</TableRow>
							) : (
								addresses.map((address) => (
									<TableRow key={address.id}>
										<TableCell>
											<div className="flex flex-col items-start gap-0.5">
												<span className="font-medium capitalize">{address.type ?? "Address"}</span>
												{address.note && (
													<span className="text-xs text-muted-foreground">{address.note}</span>
												)}
											</div>
										</TableCell>
										<TableCell>{address.line1}</TableCell>
										<TableCell className="hidden lg:table-cell">{address.line2 || "-"}</TableCell>
										<TableCell className="hidden sm:table-cell">{address.city}</TableCell>
										<TableCell className="hidden md:table-cell">{address.state}</TableCell>
										<TableCell className="hidden lg:table-cell">{address.country}</TableCell>
										<TableCell className="hidden md:table-cell">{address.postalCode}</TableCell>
										<TableCell className="hidden lg:table-cell">
											{address.digipin ? (
												<a
													className="w-fit link"
													href={`https://dac.indiapost.gov.in/mydigipin/home/${address.digipin}`}
													target="_blank"
												>
													{address.digipin}
												</a>
											) : (
												"-"
											)}
										</TableCell>
										<TableCell className="text-right">
											{profile ? <AddressActions profileId={profile.id} address={address} /> : null}
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</div>
			</div>
		</div>
	);
}
