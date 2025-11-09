import { api } from "@/convex/_generated/api";
import { NextPage } from "next";
import ProfileForm from "./__components/ProfileForm";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AddressList from "./__components/AddressList";
import RelationshipList from "./__components/RelationshipList";
import ProfilePictureForm from "./__components/ProfilePictureForm";
import { getServerSession, getToken } from "@/lib/auth-server";
import { fetchQuery } from "convex/nextjs";

const ProfilePage: NextPage<PageProps<"/profile">> = async () => {
  await getServerSession({ redirectUrl: "/profile" });
  const token = await getToken();

  const profile = await fetchQuery(api.profile.getProfile, {}, { token });

  return (
    <div className="w-full flex flex-col justify-start items-start gap-2">
      <div className="flex flex-col items-start justify-start">
        <h2 className="font-bold text-2xl">Your Profile</h2>
        <p className="text-muted-foreground">
          {profile?.profile?._id ? "Edit your profile" : "Create your profile"}
        </p>
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
          <div className="flex flex-col items-center justify-start w-full gap-2">
            {profile?.profile?._id ? (
              <ProfilePictureForm picture={profile?.profile?.picture} />
            ) : null}
            <ProfileForm profile={profile?.profile} />
          </div>
        </TabsContent>
        <TabsContent value="address">
          {profile?.profile?._id ? <AddressList /> : null}
        </TabsContent>
        <TabsContent value="relations">
          {profile?.profile?._id ? (
            <RelationshipList profileId={profile?.profile?._id} />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ProfilePage;
