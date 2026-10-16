import type { Metadata } from "next";

import { JobDetail } from "@/components/job-detail";
import { requirePageSession } from "@/lib/page-session";

export const metadata: Metadata = {
  title: "Job",
  description: "Job status, output, and recovery.",
};

type Props = { readonly params: Promise<{ readonly id: string }> };

export default async function JobPage({ params }: Props) {
  await requirePageSession();
  const { id } = await params;
  return <JobDetail id={id} />;
}
