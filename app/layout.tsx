import type { Metadata, Viewport } from "next";
import { getAppVersion } from "@/lib/app-version";
import { CoreSyncBootstrap } from "@/components/sync/core-sync-bootstrap";
import { RouteLoadingOverlay } from "@/components/route-loading-overlay";
import { PwaUpdateGuard } from "@/components/pwa-update-guard";
import { DemoSafetyBanner } from "@/components/demo-safety-banner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sales Order Demo",
  description: "Demo sales, route, order, collection, and target management app using synthetic data.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ea580c",
};

type RootLayoutProps = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  const appVersion = getAppVersion();

  return (
    <html lang="en">
      <body data-app-version={appVersion}>
        <DemoSafetyBanner />
        <RouteLoadingOverlay>
          <CoreSyncBootstrap />
          <PwaUpdateGuard />
          {children}
        </RouteLoadingOverlay>
      </body>
    </html>
  );
}
