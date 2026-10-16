import type { Metadata } from "next";
import { Suspense } from "react";

import { JobsBoard } from "@/components/jobs-board";

export const metadata: Metadata = {
  title: "Jobs",
  description: "Search and open jobs.",
};

export default function JobsPage() {
  return (
    <Suspense fallback={<p role="status">Loading jobs</p>}>
      <JobsBoard />
    </Suspense>
  );
}
