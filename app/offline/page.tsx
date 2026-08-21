import Link from "next/link";

export default function OfflinePage() {
  return <main className="offlinePage"><span>YIL <b>50</b></span><h1>You are offline</h1><p>Reconnect to view current assignments and updates. The app does not show stale operational data as if it were live.</p><Link href="/">Try again</Link></main>;
}
