import type { Metadata, Viewport } from "next";
import { getAppVersion } from "@/lib/app-version";
import { CoreSyncBootstrap } from "@/components/sync/core-sync-bootstrap";
import { RouteLoadingOverlay } from "@/components/route-loading-overlay";
import { PwaUpdateGuard } from "@/components/pwa-update-guard";
import "./globals.css";

export const metadata: Metadata = {
  title: "Manish Masala Sales",
  description: "Internal sales, route, order, collection, and target management app.",
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
        <RouteLoadingOverlay>
          <CoreSyncBootstrap />
          <PwaUpdateGuard />
          {children}
        </RouteLoadingOverlay>
      </body>
    </html>
  );
}
