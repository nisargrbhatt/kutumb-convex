import { NextPage } from "next";
import { api } from "@/convex/_generated/api";
import { notFound } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProfileTable from "./__components/ProfileTable";
import AddressList from "./__components/AddressList";
import RelationshipList from "./__components/RelationshipList";
import { Badge } from "@/components/ui/badge";
import ProfileReviewDialog from "./__components/ProfileReviewDialog";
import { getServerSession, getToken } from "@/lib/auth-server";
import { fetchQuery } from "convex/nextjs";

const MemberDetailPage: NextPage<PageProps<"/members/[id]">> = async (
  props,
) => {
  const { id } = await props.params;
  const session = await getServerSession({ redirectUrl: `/members/${id}` });
  const token = await getToken();
  const profile = await fetchQuery(
    api.profile.getProfileDetail,
    {
      id: id as string,
    },
    { token },
  );

  if (!profile) {
    return notFound();
  }

  return (
    <div className="w-full flex flex-col justify-start items-start gap-2">
      <div className="flex flex-col items-start justify-start">
        <div className="flex flex-row justify-start items-center gap-2">
          <h2 className="font-bold text-2xl">
            {[
              profile?.profile?.firstName,
              profile?.profile?.middleName,
              profile?.profile?.lastName,
            ]
              .filter(Boolean)
              .join(" ")}
          </h2>
          <Badge variant="outline" className="capitalize">
            {profile?.profile?.status}
          </Badge>
        </div>
        <p className="text-muted-foreground">{profile?.profile?.email}</p>
        {(session?.role === "admin" || session?.role === "superadmin") &&
        profile?.profile?.status === "draft" ? (
          <ProfileReviewDialog id={profile?.profile?._id} />
        ) : null}
      </div>
      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="address" disabled={!profile?.profile?._id}>
            Address
          </TabsTrigger>
          <TabsTrigger value="relations" disabled={!profile?.profile?._id}>
            Relations
          </TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          {profile?.profile ? (
            <ProfileTable profile={profile.profile} />
          ) : (
            <p className="text-sm text-muted-foreground">No profile data</p>
          )}
        </TabsContent>
        <TabsContent value="address">
          <AddressList addresses={profile?.address ?? []} />
        </TabsContent>
        <TabsContent value="relations">
          <RelationshipList relations={profile?.relations ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MemberDetailPage;
