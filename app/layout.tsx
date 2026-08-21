import type { Metadata, Viewport } from "next";
import PwaRegistration from "./PwaRegistration";
import "./globals.css";

export const metadata: Metadata = {
  title: "YIL Golden Jubilee — Event Operations",
  description: "Internal event coordination for Yuken India Limited's Golden Jubilee.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg", apple: "/favicon.svg" },
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
