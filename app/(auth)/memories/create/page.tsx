import { NextPage } from "next";
import CreateMemoryForm from "./__components/CreateMemoryForm";
import { getServerSession } from "@/lib/auth-server";

const CreateMemoryPage: NextPage<PageProps<"/memories/create">> = async () => {
  await getServerSession({ redirectUrl: "/memories/create" });

  return <CreateMemoryForm />;
};

export default CreateMemoryPage;
