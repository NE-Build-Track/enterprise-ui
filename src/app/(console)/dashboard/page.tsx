import type { Metadata } from "next";

import { Dashboard } from "@/components/dashboard";
import { requirePageSession } from "@/lib/page-session";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Allowance, cost classes, offerings, runners, jobs, and reconciliation for the signed-in actor.",
};

export default async function DashboardPage() {
  const session = await requirePageSession();
  return <Dashboard actorId={session.actorId} role={session.role} />;
}
