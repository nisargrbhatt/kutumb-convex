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
import { SettingNav } from "./SettingNav";

type OrgContext = Awaited<ReturnType<typeof getOrganizationContext>>;

interface Props {
	slug: string;
}

export function AppSidebar({ slug }: Props) {
	return (
		<Sidebar collapsible="icon">
			<SidebarHeader>
				<CommunityPicker slug={slug} />
			</SidebarHeader>
			<SidebarContent>
				<CommunityNav slug={slug} />
				<ProfileNav slug={slug} />
				<SettingNav slug={slug} />
			</SidebarContent>
			<SidebarFooter>
				<AuthUser slug={slug} />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
