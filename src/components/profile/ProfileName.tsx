import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { fullName, initials } from "@/domain/communityProfile";
import { cn } from "@/lib/utils";

type NamedProfile = Parameters<typeof fullName>[0];

export function ProfileName({ profile, className }: { profile: NamedProfile; className?: string }) {
	return <span className={className}>{fullName(profile)}</span>;
}

export function ProfileAvatar({
	profile,
	className,
	fallbackClassName,
}: {
	profile: NamedProfile;
	className?: string;
	fallbackClassName?: string;
}) {
	return (
		<Avatar className={className}>
			<AvatarFallback className={cn("font-medium", fallbackClassName)}>
				{initials(profile)}
			</AvatarFallback>
		</Avatar>
	);
}
