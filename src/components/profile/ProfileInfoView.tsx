import { format } from "date-fns";
import { Building, Calendar, Droplet, User } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoItem } from "@/components/profile/InfoItem";

type InfoProfile = {
	dateOfBirth: string | null;
	dateOfDeath: string | null;
	bloodGroup: string | null;
	gender: string | null;
	comment?: string | null;
	customFieldData: Record<string, unknown> | null;
};

// Label-keyed until custom fields move to id keys (issue 05).
type CustomFieldDef = { label: string };

const formatDate = (value: string | null) => (value ? format(new Date(value), "PPP") : "-");

const formatCustomValue = (value: unknown) =>
	value === undefined || value === null || value === "" ? "-" : String(value);

export function ProfileInfoView({
	profile,
	customFieldDefs,
}: {
	profile: InfoProfile;
	customFieldDefs: CustomFieldDef[];
}) {
	return (
		<>
			<Card className="rounded-lg border">
				<CardHeader className="border-b pb-4">
					<CardTitle className="flex items-center gap-2 text-lg font-medium">
						<User className="size-5 text-muted-foreground" /> Details
					</CardTitle>
				</CardHeader>
				<CardContent className="p-6">
					<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
						<InfoItem
							icon={<Calendar />}
							label="Date of Birth"
							value={formatDate(profile.dateOfBirth)}
						/>
						{profile.dateOfDeath ? (
							<InfoItem
								icon={<Calendar />}
								label="Date of Death"
								value={formatDate(profile.dateOfDeath)}
							/>
						) : null}
						<InfoItem icon={<Droplet />} label="Blood Group" value={profile.bloodGroup || "-"} />
						<InfoItem
							icon={<User />}
							label="Gender"
							value={profile.gender ? <span className="capitalize">{profile.gender}</span> : "-"}
						/>
					</div>

					{profile.comment ? (
						<div className="mt-8 border-t pt-6">
							<h4 className="mb-2 text-sm font-medium text-muted-foreground">Comment / Notes</h4>
							<p className="rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed text-foreground/80">
								{profile.comment}
							</p>
						</div>
					) : null}
				</CardContent>
			</Card>

			{customFieldDefs.length > 0 ? (
				<Card className="rounded-lg border">
					<CardHeader className="border-b pb-4">
						<CardTitle className="flex items-center gap-2 text-lg font-medium">
							<Building className="size-5 text-muted-foreground" /> Custom fields
						</CardTitle>
						<CardDescription>Additional information captured by this community.</CardDescription>
					</CardHeader>
					<CardContent className="p-6">
						<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
							{customFieldDefs.map((def) => (
								<InfoItem
									key={def.label}
									label={def.label}
									value={formatCustomValue(profile.customFieldData?.[def.label])}
								/>
							))}
						</div>
					</CardContent>
				</Card>
			) : null}
		</>
	);
}
