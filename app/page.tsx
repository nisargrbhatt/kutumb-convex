"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Newspaper, Users, Share2, Images, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-dvh">
      {/* Hero Section */}
      <section className="container mx-auto px-4 pt-20 pb-16 md:pt-28 md:pb-20">
        <div className="max-w-3xl">
          <Badge className="mb-4" variant="secondary">
            Hindu Community
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            Kutumb
          </h1>
          <p className="mt-4 text-muted-foreground text-base md:text-lg">
            A welcoming space to connect families, share wisdom, and celebrate
            our heritage. Explore blogs, discover members, map relationships,
            and preserve memories in a beautiful photo gallery.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href="/profile">
              <Button size="lg" className="group">
                Join the Community
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </Link>
            <Button size="lg" variant="outline">
              Explore Blogs
            </Button>
          </div>
        </div>
      </section>

      <Separator className="container mx-auto" />

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-10 md:py-14">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {/* Blogs */}
          <Card>
            <CardHeader className="space-y-1">
              <div className="flex items-center gap-2 text-primary">
                <Newspaper className="h-5 w-5" />
                <CardTitle>Blogs</CardTitle>
              </div>
              <CardDescription>
                Discourses, life-lessons, festivals, culture and more.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Dharma</Badge>
                <Badge variant="secondary">Festivals</Badge>
                <Badge variant="secondary">Family Stories</Badge>
                <Badge variant="secondary">Culture</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Members */}
          <Card>
            <CardHeader className="space-y-1">
              <div className="flex items-center gap-2 text-primary">
                <Users className="h-5 w-5" />
                <CardTitle>Members</CardTitle>
              </div>
              <CardDescription>
                Discover families and connect with relatives.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex -space-x-2">
                {Array.from({ length: 7 }).map((_, i) => (
                  <Avatar
                    key={i}
                    className="h-8 w-8 border-2 border-background bg-gradient-to-br from-primary/20 to-primary/40"
                  />
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Browse the complete members directory.
              </p>
            </CardContent>
          </Card>

          {/* Relationship Graphs */}
          <Card>
            <CardHeader className="space-y-1">
              <div className="flex items-center gap-2 text-primary">
                <Share2 className="h-5 w-5" />
                <CardTitle>Relationship Graphs</CardTitle>
              </div>
              <CardDescription>
                Visualize family trees and connections.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  relations: {
                    label: "Relations",
                    color: "hsl(var(--primary))",
                  },
                }}
                className="aspect-[16/10] w-full"
              >
                <AreaChart
                  data={[
                    { name: "2019", relations: 20 },
                    { name: "2020", relations: 28 },
                    { name: "2021", relations: 34 },
                    { name: "2022", relations: 42 },
                    { name: "2023", relations: 50 },
                    { name: "2024", relations: 65 },
                  ]}
                >
                  <defs>
                    <linearGradient
                      id="fillRelations"
                      x1="0"
                      x2="0"
                      y1="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0.35}
                      />
                      <stop
                        offset="95%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0.05}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeOpacity={0.2} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={24} />
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  <Area
                    type="monotone"
                    dataKey="relations"
                    stroke="hsl(var(--primary))"
                    fill="url(#fillRelations)"
                  />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Photo Gallery */}
          <Card>
            <CardHeader className="space-y-1">
              <div className="flex items-center gap-2 text-primary">
                <Images className="h-5 w-5" />
                <CardTitle>Photo Gallery</CardTitle>
              </div>
              <CardDescription>
                Cherish moments from family events and festivals.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <Carousel className="w-full">
                  <CarouselContent className="-ml-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <CarouselItem key={i} className="basis-full pl-2">
                        <div className="aspect-[16/10] w-full overflow-hidden rounded-md bg-gradient-to-br from-muted to-muted-foreground/20" />
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <CarouselPrevious className="-left-4" />
                  <CarouselNext className="-right-4" />
                </Carousel>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
