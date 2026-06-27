import Link from "next/link";
import { IconHome, IconTasks } from "@/components/icons";

export const dynamic = "force-static";

export default function NotFound() {
  return (
    <div className="not-found">
      <div className="not-found-card">
        <div className="eyebrow mono">404 · Not found</div>
        <h1 className="display">This page is off the map.</h1>
        <p className="sub">
          The link you followed may be broken, the resource may have been moved,
          or you might not have access. Either way, here&apos;s where to go next.
        </p>
        <div className="not-found-actions">
          <Link href="/" className="btn"><IconHome size={14} /> Home</Link>
          <Link href="/tasks" className="btn-ghost"><IconTasks size={14} /> Tasks</Link>
        </div>
      </div>
    </div>
  );
}