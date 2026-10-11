import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { PageHeader } from "@/components/CommunityLayout/PageHeader";
import { AddAddressButton, AddressActions } from "@/components/address/AddressActions";
import { ProfileIdentityHeader } from "@/components/profile/ProfileIdentityHeader";
import { ProfileInfoView } from "@/components/profile/ProfileInfoView";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileRequestBanner } from "@/components/changeRequest/ProfileRequestBanner";
import { fullName } from "@/domain/communityProfile";
import { profileEditMode } from "@/domain/memberRequests";
import { isAppError } from "@/domain/errors";
import { useCan } from "@/hooks/useCan";
import { safeAsync } from "@/lib/safe";
import { memberDetailQuery } from "@/queries/communityProfile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MemberActions } from "./-components/MemberActions";
import { MemberHistory } from "./-components/MemberHistory";
import { MemberInfoEditButton } from "./-components/MemberInfoEditButton";
import { MemberRelations } from "./-components/MemberRelations";

export const Route = createFileRoute("/_authed/_community/members/$id/")({
	component: RouteComponent,
	loader: async ({ context, params }) => {
		const result = await safeAsync(
			context.queryClient.ensureQueryData(memberDetailQuery(context.organizationId, params.id))
		);

		if (!result.success) {
			if (isAppError(result.error) && result.error.kind === "NotFound") {
				throw notFound();
			}
			throw result.error;
		}
	},
});

function RouteComponent() {
	const { organizationId: orgId } = Route.useRouteContext();
	const { id } = Route.useParams();
	const {
		data: { profile, addresses, customFieldDefs, outgoingRelations, incomingRelations },
	} = useSuspenseQuery(memberDetailQuery(orgId, id));
	const canReview = useCan({ changeRequest: ["review"] });
	const editMode = profileEditMode({ canReview }, profile);
	const canEditUserless = editMode !== "none";
	const suggest = editMode === "suggest";
	const canAudit = useCan({ auditEvent: ["read"] });
	const name = fullName(profile);

	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 overflow-y-auto p-2">
			<PageHeader crumbs={[{ label: "Members", to: "/members" }, { label: name }]} />

			<div className="flex w-full flex-col gap-6 pb-12">
				<ProfileIdentityHeader
					profile={profile}
					headingLevel="h1"
					actions={
						canReview ? (
							<MemberActions profile={profile} customFieldDefs={customFieldDefs} />
						) : canEditUserless ? (
							<MemberInfoEditButton
								profile={profile}
								customFieldDefs={customFieldDefs}
								suggest={suggest}
							/>
						) : null
					}
				/>

				<ProfileRequestBanner orgId={orgId} profile={profile} canReview={canReview} />

				<Tabs defaultValue="overview" className="gap-4">
					{canAudit ? (
						<TabsList>
							<TabsTrigger value="overview">Overview</TabsTrigger>
							<TabsTrigger value="history">History</TabsTrigger>
						</TabsList>
					) : null}
					<TabsContent value="overview" className="flex flex-col gap-6">
						<ProfileInfoView profile={profile} customFieldDefs={customFieldDefs} />

						{/* Addresses */}
						<div className="flex flex-col gap-3">
							<div className="flex flex-wrap items-end justify-between gap-2">
								<div>
									<h2 className="text-lg font-medium">Addresses</h2>
									<p className="text-sm text-muted-foreground">
										Residential, work, and other addresses on record.
									</p>
								</div>
								{canEditUserless ? (
									<AddAddressButton
										profileId={profile.id}
										suggest={suggest}
										description={
											suggest
												? "Suggest an address for this profile. An owner/admin reviews it."
												: "Add an address for this profile on its behalf."
										}
									/>
								) : null}
							</div>

							{addresses && addresses.length > 0 ? (
								<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
									{addresses.map((address) => (
										<Card key={address.id} className="rounded-lg border">
											<CardHeader className="border-b pb-3">
												<div className="flex items-center justify-between">
													<CardTitle className="flex items-center gap-2 text-base font-medium">
														<MapPin className="size-4 text-muted-foreground" />
														Address
													</CardTitle>
													<div className="flex items-center gap-2">
														<Badge variant="secondary" className="capitalize">
															{address.type}
														</Badge>
														{canEditUserless ? (
															<AddressActions
																profileId={profile.id}
																address={address}
																suggest={suggest}
															/>
														) : null}
													</div>
												</div>
											</CardHeader>
											<CardContent className="pt-4">
												<div className="flex flex-col gap-1 text-sm text-foreground/80">
													<span className="mb-1 font-medium text-foreground">{address.line1}</span>
													{address.line2 && <span>{address.line2}</span>}
													<span>
														{address.city}, {address.state} {address.postalCode}
													</span>
													<span>{address.country}</span>

													{address.digipin && (
														<div className="mt-3">
															<Badge
																variant="outline"
																className="bg-muted/40 font-mono tracking-wider"
															>
																DIGIPIN: {address.digipin}
															</Badge>
														</div>
													)}

													{address.note && (
														<p className="mt-4 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground italic">
															{address.note}
														</p>
													)}
												</div>
											</CardContent>
										</Card>
									))}
								</div>
							) : (
								<Card className="rounded-lg border border-dashed">
									<CardContent className="flex flex-col items-center justify-center py-16 text-center">
										<div className="mb-4 rounded-full bg-muted/50 p-4">
											<MapPin className="size-8 text-muted-foreground/50" />
										</div>
										<h3 className="text-lg font-medium text-foreground">No Addresses Found</h3>
										<p className="mt-1 max-w-sm text-sm text-muted-foreground">
											This profile does not have any related addresses on record at the moment.
										</p>
									</CardContent>
								</Card>
							)}
						</div>

						<MemberRelations
							profile={profile}
							outgoingRelations={outgoingRelations}
							incomingRelations={incomingRelations}
							editMode={editMode}
						/>
					</TabsContent>
					{canAudit ? (
						<TabsContent value="history">
							<MemberHistory orgId={orgId} profileId={profile.id} />
						</TabsContent>
					) : null}
				</Tabs>
			</div>
		</div>
	);
}
