"use client";
import { NextPage } from "next";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProfileTable from "./__components/ProfileTable";

const MemberDetailPage: NextPage = () => {
  const { id } = useParams();
  const router = useRouter();
  const profile = useQuery(api.profile.getProfileDetail, {
    id: id as string,
  });

  useEffect(() => {
    if (profile === null) {
      toast.error("No member found");
      router.push("/members");
    }
  }, [profile, router]);

  if (profile === undefined) {
    return <p>Loading...</p>;
  }

  return (
    <div className="w-full flex flex-col justify-start items-start gap-2">
      <div className="flex flex-col items-start justify-start">
        <h2 className="font-bold text-2xl">
          {[
            profile?.profile?.firstName,
            profile?.profile?.middleName,
            profile?.profile?.lastName,
          ]
            .filter(Boolean)
            .join(" ")}
        </h2>
        <p className="text-muted-foreground">{profile?.profile?.email}</p>
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
        <TabsContent value="address"></TabsContent>
        <TabsContent value="relations"></TabsContent>
      </Tabs>
    </div>
  );
};

export default MemberDetailPage;
