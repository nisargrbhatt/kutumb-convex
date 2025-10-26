"use server";
import { createAuth } from "@/convex/auth";
import { getToken as getTokenNextjs } from "@convex-dev/better-auth/nextjs";
import { redirect } from "next/navigation";
import { safeAsync } from "./safe";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

export const getToken = async () => {
  return getTokenNextjs(createAuth);
};

export const getServerSession = async (props?: { redirectUrl?: string }) => {
  const redirectToLogin = () => {
    if (typeof props?.redirectUrl === "string") {
      return redirect(`/sign-in?redirectUrl=${props.redirectUrl}`);
    }
    return null;
  };

  const sessionResult = await safeAsync(
    fetchQuery(
      api.auth.getCurrentUser,
      {},
      {
        token: await getToken(),
      },
    ),
  );

  if (!sessionResult.success) {
    return redirectToLogin();
  }

  if (!sessionResult.data) {
    return redirectToLogin();
  }

  return sessionResult.data;
};
