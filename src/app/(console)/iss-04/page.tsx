import type { Metadata } from "next";

import { Iss04 } from "@/components/iss04";
import { requirePageSession } from "@/lib/page-session";

export const metadata: Metadata = {
  title: "ISS-04",
  description:
    "Engine health, the balanced-spend check, one-attempt offering probes, repeat operation refs, and reserved routes.",
};

export default async function Iss04Page() {
  const session = await requirePageSession();
  return <Iss04 role={session.role} actorId={session.actorId} />;
}
