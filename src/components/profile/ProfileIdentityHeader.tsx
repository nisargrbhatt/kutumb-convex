import type { ReactNode } from "react";
import { Mail, Phone, User } from "lucide-react";
import { fullName } from "@/domain/communityProfile";
import { ProfileAvatar } from "@/components/profile/ProfileName";
import { ProfileStatusBadge } from "@/components/profile/ProfileStatusBadge";

type IdentityProfile = Parameters<typeof fullName>[0] & {
	status: string;
	nickName: string | null;
	email: string | null;
	mobileNumber: string | null;
};

/** Avatar, name, status, nickname and contact line; `actions` sits right on sm+. */
export function ProfileIdentityHeader({
	profile,
	actions,
	headingLevel: Heading = "h2",
}: {
	profile: IdentityProfile;
	actions?: ReactNode;
	headingLevel?: "h1" | "h2";
}) {
	return (
		<div className="flex flex-col justify-between gap-4 rounded-lg border p-6 sm:flex-row sm:items-center">
			<div className="flex min-w-0 items-center gap-4">
				<ProfileAvatar
					profile={profile}
					className="size-16 shrink-0 sm:size-20"
					fallbackClassName="text-xl"
				/>

				<div className="flex min-w-0 flex-col gap-1.5">
					<div className="flex flex-wrap items-center gap-2">
						<Heading className="text-xl font-semibold tracking-tight break-words sm:text-2xl">
							{fullName(profile)}
						</Heading>
						<ProfileStatusBadge status={profile.status} />
					</div>
					{profile.nickName ? (
						<p className="flex items-center gap-1.5 text-sm text-muted-foreground">
							<User className="size-4" />"{profile.nickName}"
						</p>
					) : null}
					{profile.email || profile.mobileNumber ? (
						<div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
							{profile.email ? (
								<span className="flex min-w-0 items-center gap-1.5 break-all">
									<Mail className="size-3.5 shrink-0" />
									{profile.email}
								</span>
							) : null}
							{profile.mobileNumber ? (
								<span className="flex items-center gap-1.5">
									<Phone className="size-3.5 shrink-0" />
									{profile.mobileNumber}
								</span>
							) : null}
						</div>
					) : null}
				</div>
			</div>
			{actions}
		</div>
	);
}
