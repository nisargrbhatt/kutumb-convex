import type { Metadata } from "next";
import { Roboto, Merriweather, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/layout/Layout";

const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  fallback: [
    "ui-monospace",
    "SFMono-Regular",
    "Menlo",
    "Monaco",
    "Consolas",
    "Liberation Mono",
    "Courier New",
    "monospace",
  ],
  preload: true,
  adjustFontFallback: true,
  display: "auto",
  variable: "--font-mono",
});

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  fallback: ["sans-serif"],
  preload: true,
  adjustFontFallback: true,
  display: "swap",
  variable: "--font-sans",
});

const merriweather = Merriweather({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  fallback: ["serif"],
  preload: true,
  adjustFontFallback: true,
  display: "swap",
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: "Kutumb App",
  description:
    "Kutumb Community App by Gandhinagar Yuvak Mandal for Shree Sorthiya Shree Gaud Brahmin Samaj",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ConvexAuthNextjsServerProvider>
      <html
        lang="en"
        suppressHydrationWarning
        className={`${roboto.variable} ${merriweather.variable} ${geistMono.variable}`}
      >
        <body className={`antialiased h-full`}>
          <ConvexClientProvider>
            <Layout>{children}</Layout>
          </ConvexClientProvider>
          <Toaster />
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
