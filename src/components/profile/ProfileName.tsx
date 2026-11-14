import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { blobUrl } from "@/domain/blob";
import { fullName, initials } from "@/domain/communityProfile";
import { useActor } from "@/hooks/useActor";
import { cn } from "@/lib/utils";

type NamedProfile = Parameters<typeof fullName>[0];

export function ProfileName({ profile, className }: { profile: NamedProfile; className?: string }) {
	return <span className={className}>{fullName(profile)}</span>;
}

type PhotoProps = {
	photoBlobId?: string | null;
	variant?: "avatar" | "display";
	className?: string;
	fallbackClassName?: string;
};

/**
 * Profile Photo or `initials`. `photoBlobId` is a Blob of the active org (profile reads are
 * org-scoped); lists use `avatar`, the profile header `display`. Initials show while loading and
 * on any load error.
 */
export function PhotoAvatar({
	initials: text,
	photoBlobId,
	variant = "avatar",
	className,
	fallbackClassName,
}: PhotoProps & { initials: string }) {
	const organizationId = useActor()?.organizationId;
	const src = photoBlobId && organizationId ? blobUrl(organizationId, photoBlobId, variant) : null;
	// Keyed by src: Base UI keeps the root's "loaded" status after the image unmounts, which
	// would hide the fallback when a photo is removed.
	return (
		<Avatar key={src ?? "none"} className={className}>
			{src ? <AvatarImage src={src} alt="" /> : null}
			<AvatarFallback className={cn("font-medium", fallbackClassName)}>{text}</AvatarFallback>
		</Avatar>
	);
}

/** `PhotoAvatar` with the profile's initials. */
export function ProfileAvatar({ profile, ...props }: PhotoProps & { profile: NamedProfile }) {
	return <PhotoAvatar initials={initials(profile)} {...props} />;
}
