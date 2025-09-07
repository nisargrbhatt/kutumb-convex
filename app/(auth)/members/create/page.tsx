import { Metadata, NextPage } from "next";
import MemberForm from "./__components/MemberForm";

export const metadata: Metadata = {
  title: "Create New Member",
  description: "Add a new member profile to Kutumb App",
};

const MemberCreatePage: NextPage = () => {
  return (
    <div className="w-full flex flex-col justify-start items-start gap-2">
      <div className="flex flex-col items-start justify-start">
        <h2 className="font-bold text-2xl">Members Create Form</h2>
        <p className="text-muted-foreground">
          Add a record for a missing member of our family
        </p>
      </div>
      <MemberForm />
    </div>
  );
};

export default MemberCreatePage;
