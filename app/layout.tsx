import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { AppVersionGuard } from "@/components/app-version-guard";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "結帳系統",
  description: "多店作帳管理系統",
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,   // prevent accidental zoom on input focus (iOS)
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const appVersion = process.env.VERCEL_DEPLOYMENT_ID
    ?? process.env.VERCEL_GIT_COMMIT_SHA
    ?? "development";

  return (
    <html lang="zh-Hant" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster richColors position="top-right" />
        <AppVersionGuard currentVersion={appVersion} />
      </body>
    </html>
  );
}
