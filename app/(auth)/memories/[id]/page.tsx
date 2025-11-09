import { Carousel, CarouselItem } from "@/components/ui/carousel";
import { api } from "@/convex/_generated/api";
import { getServerSession, getToken } from "@/lib/auth-server";
import { fetchQuery } from "convex/nextjs";
import { Metadata, NextPage } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Memory Detail",
};

const MemoryDetailPage: NextPage<PageProps<"/memories/[id]">> = async ({
  params,
}) => {
  const { id } = await params;

  const memory = await fetchQuery(api.memories.getMemory, { id });

  if (!memory) {
    return notFound();
  }

  return (
    <div className="w-full flex flex-col justify-start items-start gap-2">
      <div className="flex flex-col items-start justify-start">
        <div className="flex flex-row justify-start items-center gap-2">
          <h2 className="font-bold text-2xl">{memory.title}</h2>
        </div>
        <Link
          href={`/members/${memory?.createdBy?.id}`}
          className="link font-p"
        >
          {memory?.createdBy?.name}
        </Link>
      </div>
      <div className="w-full flex flex-row justify-center items-center">
        <Carousel>
          {memory?.images?.map((i, index) => (
            <CarouselItem className="p-0" key={index}>
              <img
                loading="lazy"
                src={i ?? ""}
                alt={`${memory?.title} - ${index}`}
                className="rounded-lg object-contain h-full max-h-[250px] md:max-h-[400px]"
              />
            </CarouselItem>
          ))}
        </Carousel>
      </div>
      <div className="w-full">
        <p className="font-p">{memory.content}</p>
      </div>
    </div>
  );
};

export default MemoryDetailPage;
