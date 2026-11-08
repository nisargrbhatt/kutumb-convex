import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { blobUrl } from "@/domain/blob";
import { fullName, initials } from "@/domain/communityProfile";
import { useActor } from "@/hooks/useActor";
import { cn } from "@/lib/utils";

type NamedProfile = Parameters<typeof fullName>[0];

export function ProfileName({ profile, className }: { profile: NamedProfile; className?: string }) {
	return <span className={className}>{fullName(profile)}</span>;
}

/**
 * Profile Photo or initials. `photoBlobId` is a Blob of the active org (profile reads are
 * org-scoped); lists use `avatar`, the profile header `display`. Initials show while loading and
 * on any load error.
 */
export function ProfileAvatar({
	profile,
	photoBlobId,
	variant = "avatar",
	className,
	fallbackClassName,
}: {
	profile: NamedProfile;
	photoBlobId?: string | null;
	variant?: "avatar" | "display";
	className?: string;
	fallbackClassName?: string;
}) {
	const organizationId = useActor()?.organizationId;
	return (
		<Avatar className={className}>
			{photoBlobId && organizationId ? (
				<AvatarImage src={blobUrl(organizationId, photoBlobId, variant)} alt="" />
			) : null}
			<AvatarFallback className={cn("font-medium", fallbackClassName)}>
				{initials(profile)}
			</AvatarFallback>
		</Avatar>
	);
}
