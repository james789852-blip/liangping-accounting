import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import { AppVersionGuard } from "@/components/app-version-guard";
import { PWAShell } from "@/components/pwa-shell";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "@fontsource-variable/noto-sans-tc";
import "./globals.css";

export const metadata: Metadata = {
  title: "結帳系統",
  description: "多店作帳管理系統",
  applicationName: "結帳系統",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "結帳系統",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: '#f59e0b',
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
    <html lang="zh-Hant" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster richColors position="top-right" />
        <AppVersionGuard currentVersion={appVersion} />
        <PWAShell />
        <SpeedInsights />
      </body>
    </html>
  );
}
