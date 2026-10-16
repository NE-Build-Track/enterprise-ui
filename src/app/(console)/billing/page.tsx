import type { Metadata } from "next";

import { Billing } from "@/components/billing";
import { requirePageSession } from "@/lib/page-session";

export const metadata: Metadata = {
  title: "Billing",
  description: "Allowance, period spend, and reconciliation.",
};

export default async function BillingPage() {
  await requirePageSession();
  return <Billing />;
}
