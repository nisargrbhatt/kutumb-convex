"use client";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useQuery,
} from "convex/react";
import Link from "next/link";
import type { FC } from "react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Skeleton } from "../ui/skeleton";

const AuthMenu: FC = () => {
  const user = useQuery(api.auth.getCurrentUser);
  const router = useRouter();

  const onLogout = async () => {
    await authClient.signOut();
    toast.success("Logged out successfully");
    router.push("/sign-in");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Avatar>
          <AvatarFallback>{user?.email?.at(0)?.toUpperCase()}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end">
        <DropdownMenuLabel>
          <p className="font-medium">My Account</p>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => {
              router.push("/profile");
            }}
          >
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onLogout}>Logout</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const FeatureMenu: FC = () => {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size={"sm"}>
          Features
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => {
              router.push("/members");
            }}
          >
            Members
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              router.push("/family-tree");
            }}
          >
            Family Tree
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

interface Props {}

const Header: FC<Props> = () => {
  return (
    <header className="py-3 px-4 border-b w-full shadow-xs">
      <nav className="flex w-full flex-row justify-between items-center gap-1">
        <Link href="/">Kutumb</Link>

        <Unauthenticated>
          <Link href="/sign-in">
            <Button type="button" variant="link">
              Sign In
            </Button>
          </Link>
        </Unauthenticated>
        <AuthLoading>
          <Skeleton className="h-8 w-8 rounded-full" />
        </AuthLoading>
        <Authenticated>
          <div className="flex flex-row gap-2 items-center justify-end">
            <FeatureMenu />
            <AuthMenu />
          </div>
        </Authenticated>
      </nav>
    </header>
  );
};

export default Header;
