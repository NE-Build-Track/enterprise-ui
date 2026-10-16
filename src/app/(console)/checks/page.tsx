import type { Metadata } from "next";

import { Iss04 } from "@/components/iss04";
import { requirePageSession } from "@/lib/page-session";

export const metadata: Metadata = {
  title: "Checks",
  description: "Engine version, discovery status, release checks, and evidence.",
};

export default async function ChecksPage() {
  const session = await requirePageSession();
  return <Iss04 role={session.role} actorId={session.actorId} />;
}
