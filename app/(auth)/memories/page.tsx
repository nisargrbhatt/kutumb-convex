"use client";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Carousel, CarouselItem } from "@/components/ui/carousel";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import Link from "next/link";
import type { FC } from "react";

interface Props {}

const MemoriesPage: FC<Props> = () => {
  const memories = useQuery(api.memories.listMemories);

  return (
    <div className="w-full flex flex-col justify-start items-start gap-2">
      <div className="flex flex-col items-start justify-start">
        <h2 className="font-bold text-2xl">Memories</h2>
        <p className="text-muted-foreground">
          List of top memories shared by family members
        </p>
        <Link href="/memories/create">
          <Button type="button">Create Memory</Button>
        </Link>
      </div>
      <div className="flex w-full flex-col justify-start items-start gap-1">
        {typeof memories === "undefined" ? (
          <p className="w-full text-center text-sm">Loading memories...</p>
        ) : null}
        {memories && memories?.length < 1 ? (
          <p className="w-full text-center text-sm">No recent memories found</p>
        ) : null}
        {memories && memories?.length > 0 ? (
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2">
            {memories.map((memory) => (
              <Link key={memory._id} href={`/memories/${memory._id}`}>
                <Card className="w-full">
                  <CardHeader>
                    <div className="w-full flex flex-row justify-start items-center gap-1">
                      <Avatar>
                        <AvatarImage
                          src={memory?.createdBy?.picture ?? undefined}
                        />
                        <AvatarFallback>
                          {memory?.createdBy?.name?.at(0)?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 flex flex-col w-full justify-center items-start">
                        <CardTitle>{memory?.title}</CardTitle>
                        <CardDescription>
                          {memory?.createdBy?.name}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Carousel className="w-full ">
                      {memory?.images?.map((i, index) => (
                        <CarouselItem className="p-0" key={index}>
                          <img
                            loading="lazy"
                            src={i ?? ""}
                            alt={`${memory?.title} - ${index}`}
                            className="rounded-lg object-contain h-full w-full max-h-[250px]"
                          />
                        </CarouselItem>
                      ))}
                    </Carousel>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default MemoriesPage;
