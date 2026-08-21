import type { Metadata, Viewport } from "next";
import PwaRegistration from "./PwaRegistration";
import "./globals.css";
import "./touch-targets.css";

export const metadata: Metadata = {
  title: "YIL Golden Jubilee — Event Operations",
  description: "Internal event coordination for Yuken India Limited's Golden Jubilee.",
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }, { url: "/icon-512.png", sizes: "512x512", type: "image/png" }], shortcut: "/icon-192.png", apple: "/icon-192.png" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "YIL 50 Ops",
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#08233b" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en"><body>{children}<PwaRegistration /></body></html>
  );
}
