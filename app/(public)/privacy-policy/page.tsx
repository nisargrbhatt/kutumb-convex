import { Metadata, NextPage } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy Policy for Kutumb App",
};

const PrivacyPolicyPage: NextPage<PageProps<"/privacy-policy">> = () => {
  return (
    <div className="w-full flex flex-col justify-start items-start gap-2">
      <div className="flex flex-col items-start justify-start">
        <h2 className="font-bold text-2xl">Privacy Policy</h2>
        <p className="text-muted-foreground">Privacy Policy of Kutumb App</p>
      </div>

      <section>
        <h2 className="text-xl font-medium">Introduction</h2>
        <p className="text-sm text-muted-foreground">
          Welcome to Kutumb&apos;s Privacy Policy. At Kutumb, we are committed
          to protecting your privacy and ensuring the security of your personal
          information. This policy explains how we collect, use, and safeguard
          your data when you use our Hindu community platform.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-medium">Data Collection and Usage</h2>
        <p className="text-sm text-muted-foreground">
          We only collect information that is necessary to provide you with our
          services:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li className="text-sm">
            Basic profile information (name, email, profile picture)
          </li>
          <li className="text-sm">Family relationships and connections</li>
          <li className="text-sm">
            Community participation and interaction data
          </li>
          <li className="text-sm">Account preferences and settings</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-medium">Data Protection</h2>
        <p className="text-sm text-muted-foreground">
          Your privacy is our top priority. Here&apos;s how we protect your
          data:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li className="text-sm">
            All personal information is stored in encrypted format
          </li>
          <li className="text-sm">
            We do not use any third-party cookies for tracking
          </li>
          <li className="text-sm">
            Access to personal data is strictly controlled and monitored
          </li>
          <li className="text-sm">
            Regular security audits and updates are performed
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-medium">No Third-Party Cookies</h2>
        <p className="text-sm text-muted-foreground">
          We want to be transparent about our practices: Kutumb does not use any
          third-party cookies for tracking or advertising purposes. We only use
          essential cookies that are necessary for the basic functionality of
          our platform.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-medium">Your Rights</h2>
        <p className="text-sm text-muted-foreground">You have the right to:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li className="text-sm">Access your personal data</li>
          <li className="text-sm">Request corrections to your information</li>
          <li className="text-sm">Delete your account and associated data</li>
          <li className="text-sm">Export your data in a portable format</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-medium">Contact Us</h2>
        <p className="text-sm text-muted-foreground">
          If you have any questions about our privacy practices or would like to
          exercise your privacy rights, please contact us at privacy@kutumb.com
        </p>
      </section>

      <section>
        <h2 className="text-xl font-medium">Updates to This Policy</h2>
        <p className="text-sm text-muted-foreground">
          We may update this privacy policy from time to time. Any significant
          changes will be notified to you through our platform or via email.
        </p>
        <p className="text-sm text-muted-foreground mt-4">
          Last updated: September 6, 2025
        </p>
      </section>
    </div>
  );
};
export default PrivacyPolicyPage;
