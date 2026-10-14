import type { ReactNode } from "react";

import { Shell } from "@/components/shell";
import { requirePageSession } from "@/lib/page-session";

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const session = await requirePageSession();
  return (
    <Shell role={session.role} actorId={session.actorId}>
      {children}
    </Shell>
  );
}
