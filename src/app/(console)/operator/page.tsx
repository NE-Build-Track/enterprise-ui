import type { Metadata } from "next";

import { OperatorDesk } from "@/components/operator";
import { requirePageSession } from "@/lib/page-session";

export const metadata: Metadata = {
  title: "Operator",
  description: "Compare every actor's allowance and reconciliation, issue or revoke keys, and sync costs.",
};

export default async function OperatorPage() {
  const session = await requirePageSession();
  if (session.role !== "operator") {
    return (
      <article className="panel">
        <h1>Operator</h1>
        <p>Sign in with an admin key to issue keys and read every actor.</p>
      </article>
    );
  }
  return <OperatorDesk />;
}
