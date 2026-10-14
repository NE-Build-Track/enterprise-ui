import type { DetailedHTMLProps, HTMLAttributes } from "react";

type Host = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "lp-allowance-meter": Host;
      "lp-cost-breakdown": Host;
      "lp-runner-list": Host;
      "lp-job-list": Host;
      "lp-job-timeline": Host;
      "lp-job-runner": Host;
      "lp-reconciliation-card": Host;
      "lp-actor-attribution-table": Host;
      "lp-key-table": Host;
      "lp-blocker-checklist": Host;
    }
  }
}
