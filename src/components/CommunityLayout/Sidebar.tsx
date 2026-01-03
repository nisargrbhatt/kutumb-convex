import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarRail,
} from "@/components/ui/sidebar";
import { CommunityPicker } from "./CommunityPicker";
import { AuthUser } from "./AuthUser";
import type { getOrganizationContext } from "@/api/organization";
import { CommunityNav } from "./CommunityNav";
import { ProfileNav } from "./ProfileNav";

type OrgContext = Awaited<ReturnType<typeof getOrganizationContext>>;

interface Props {
	org: NonNullable<OrgContext["org"]>;
	allOrg: OrgContext["allOrg"];
	profile: OrgContext["profile"];
}

export function AppSidebar({ allOrg, org, profile }: Props) {
	return (
		<Sidebar collapsible="icon">
			<SidebarHeader>
				<CommunityPicker allOrg={allOrg} org={org} />
			</SidebarHeader>
			<SidebarContent>
				<CommunityNav slug={org.slug} />
				<ProfileNav slug={org.slug} />
			</SidebarContent>
			<SidebarFooter>
				<AuthUser org={org} profile={profile} />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
