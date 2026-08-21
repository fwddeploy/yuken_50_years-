import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "YIL Golden Jubilee Event Operations",
    short_name: "YIL 50 Ops",
    description: "Internal event coordination for Yuken India Limited's Golden Jubilee.",
    start_url: "/",
    display: "standalone",
    background_color: "#061827",
    theme_color: "#08233b",
    orientation: "portrait-primary",
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
