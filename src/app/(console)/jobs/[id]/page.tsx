import type { Metadata } from "next";

import { JobDetail } from "@/components/job-detail";
import { requirePageSession } from "@/lib/page-session";

export const metadata: Metadata = {
  title: "Job",
  description: "Job status, output, and recovery.",
};

type Props = { params: Promise<{ id: string }> };

export default async function JobPage({ params }: Props) {
  await requirePageSession();
  const { id } = await params;
  return <JobDetail id={id} />;
}
