import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to the Livepeer enterprise desk with the lpk_ actor key this desk issued. The engine checks that key on every request.",
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
