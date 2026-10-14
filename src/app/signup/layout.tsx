import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Issue an actor key",
  description:
    "Issue an lpk_ actor key for an actor that already has an allocation on the shared grant. The key is shown once and does not move money.",
};

export default function SignupLayout({ children }: { children: ReactNode }) {
  return children;
}
