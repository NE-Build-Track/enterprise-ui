import type { Metadata } from "next";

import { NewJob } from "@/components/new-job";
import { requirePageSession } from "@/lib/page-session";

export const metadata: Metadata = {
  title: "New job",
  description: "Choose a task, configure inputs, and run a job.",
};

type Props = { searchParams: Promise<{ app?: string; again?: string }> };

export default async function NewJobPage({ searchParams }: Props) {
  await requirePageSession();
  const query = await searchParams;
  return <NewJob app={query.app ?? ""} again={query.again === "1"} />;
}
