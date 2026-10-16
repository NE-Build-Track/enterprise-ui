import type { Metadata } from "next";

import { Overview } from "@/components/overview";
import { requirePageSession } from "@/lib/page-session";

export const metadata: Metadata = {
  title: "Overview",
  description: "Queued jobs, recent failures, available credit, and spend for the current period.",
};

export default async function OverviewPage() {
  const session = await requirePageSession();
  return <Overview actorId={session.actorId} role={session.role} />;
}
