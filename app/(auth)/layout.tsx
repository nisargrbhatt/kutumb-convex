"use client";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import Link from "next/link";
import type { FC, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

const AuthLayout: FC<Props> = ({ children }) => {
  return (
    <>
      <Authenticated>{children}</Authenticated>
      <AuthLoading>
        <p>Loading...</p>
      </AuthLoading>
      <Unauthenticated>
        <div className="w-full flex flex-col justify-center items-center gap-2">
          You are logged out. Please <Link href="/sign-in">Sign In</Link> again
        </div>
      </Unauthenticated>
    </>
  );
};

export default AuthLayout;
