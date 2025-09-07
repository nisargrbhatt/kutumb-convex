import SignIn from "@/app/(unauth)/sign-in/SignIn";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In to Kutumb",
  description: "Sign In to Kutumb App",
};

export default function SignInPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <SignIn />
      </div>
    </div>
  );
}
