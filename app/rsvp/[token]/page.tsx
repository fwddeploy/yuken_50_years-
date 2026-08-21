import type { Metadata } from "next";
import RsvpResponseApp from "./RsvpResponseApp";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Golden Jubilee invitation response", description: "Respond to your YIL Golden Jubilee invitation.", openGraph: { title: "Golden Jubilee invitation response", description: "Respond to your YIL Golden Jubilee invitation.", images: [] }, twitter: { title: "Golden Jubilee invitation response", description: "Respond to your YIL Golden Jubilee invitation.", images: [] } };
}

export default async function RsvpPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <RsvpResponseApp token={token} />;
}
