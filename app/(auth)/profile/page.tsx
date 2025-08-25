"use client";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { NextPage } from "next";
import ProfileForm from "./__components/ProfileForm";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AddressList from "./__components/AddressList";
import RelationshipList from "./__components/RelationshipList";

const ProfilePage: NextPage = () => {
  const profile = useQuery(api.profile.getProfile);

  if (profile === undefined) {
    return <p>Loading...</p>;
  }

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
          <ProfileForm profile={profile?.profile} />
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
