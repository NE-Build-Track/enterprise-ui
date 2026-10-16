import { css } from "@gyral/core";

export const widgetStyles = css`
  @layer components {
    :host {
      display: block;
      container-type: inline-size;
      color: inherit;
      font: inherit;
      accent-color: var(--brand, oklch(40% 0.09 170));
    }

    h2 {
      margin-block: 1.25rem 0.75rem;
      font-family: var(--font-display), Georgia, serif;
      font-size: 1.25rem;
      font-weight: 560;
      font-optical-sizing: auto;
      letter-spacing: -0.02em;
      line-height: 1.15;
      text-wrap: balance;

      &:first-child {
        margin-block-start: 0;
      }
    }

    p,
    li,
    figcaption,
    dd {
      text-wrap: pretty;
    }

    p {
      max-inline-size: 70ch;
      margin-block: 0.4rem;
      margin-inline: 0;
    }

    dl {
      display: grid;
      grid-template-columns: minmax(8rem, 12rem) 1fr;
      gap: 0.35rem 1rem;
      margin: 0;
    }

    dt {
      color: var(--text-muted, oklch(46% 0.018 81));
    }

    dd {
      margin: 0;
      font-variant-numeric: tabular-nums;
    }

    figure {
      margin-block: 0.5rem;
      margin-inline: 0;
    }

    figcaption {
      color: var(--text-muted, oklch(46% 0.018 81));
      font-size: 0.85rem;
    }

    table {
      inline-size: 100%;
      border-collapse: collapse;
      font-size: 1rem;
    }

    caption {
      margin-block-end: 0.5rem;
      text-align: start;
      font-weight: 650;
    }

    th,
    td {
      padding-block: 0.45rem;
      padding-inline: 0.4rem;
      border-block-end: 1px solid var(--border, oklch(89% 0.026 79));
      text-align: start;
      vertical-align: top;
    }

    th {
      color: var(--text-muted, oklch(46% 0.018 81));
      font-size: 0.875rem;
      font-weight: 650;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    button,
    input,
    select,
    textarea {
      font: inherit;
      color: inherit;
      touch-action: manipulation;
    }

    button {
      min-block-size: 2.75rem;
      border: 1px solid var(--text, oklch(21.5% 0.009 82));
      border-radius: 999px;
      padding-block: 0.4rem;
      padding-inline: 0.85rem;
      background: var(--text, oklch(21.5% 0.009 82));
      color: var(--surface, oklch(95.3% 0.013 82));
      cursor: pointer;

      &.quiet {
        background: transparent;
        color: inherit;
      }

      &:disabled {
        cursor: not-allowed;
        opacity: 0.45;
      }

      &:focus-visible {
        outline: 2px solid var(--brand, oklch(40% 0.09 170));
        outline-offset: 2px;
      }
    }

    label {
      display: grid;
      gap: 0.25rem;
      font-size: 1rem;
    }

    input,
    select,
    textarea {
      border: 2px solid var(--border, oklch(89% 0.026 79));
      border-radius: 0.4rem;
      padding-block: 0.45rem;
      padding-inline: 0.55rem;
      background: var(--surface-raised, oklch(99.4% 0.007 89));

      &:focus-visible {
        outline: 2px solid var(--brand, oklch(40% 0.09 170));
        outline-offset: 2px;
      }

      &:user-invalid {
        border-color: var(--danger, oklch(42% 0.16 14));
      }
    }

    textarea {
      field-sizing: content;
      min-block-size: 8rem;
    }

    form,
    fieldset {
      display: grid;
      gap: 0.75rem;
    }

    fieldset {
      margin: 0;
      border: 0;
      padding: 0;
    }

    .request-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }

    .request-tabs label {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      inline-size: fit-content;
      min-block-size: 2.75rem;
      border: 1px solid var(--border, oklch(89% 0.026 79));
      border-radius: 999px;
      padding-block: 0.2rem;
      padding-inline: 0.75rem;
      cursor: pointer;
    }

    .request-tabs label:has(:checked) {
      border-color: var(--text, oklch(21.5% 0.009 82));
      background: var(--text, oklch(21.5% 0.009 82));
      color: var(--surface, oklch(95.3% 0.013 82));
    }

    .request-tabs label:focus-within {
      outline: 2px solid var(--brand, oklch(40% 0.09 170));
      outline-offset: 2px;
    }

    .job-form {
      display: grid;
      gap: 1.25rem;
      align-items: start;
    }

    .job-controls {
      display: grid;
      gap: 0.75rem;
      align-content: start;
    }

    .tasks {
      display: grid;
      gap: 0.5rem;
      align-content: start;
    }

    .task-search {
      display: grid;
      gap: 0.25rem;
      border: 0;
      padding: 0;
      background: transparent;
      cursor: auto;
    }

    .task-list {
      display: grid;
      gap: 0.5rem;
      align-content: start;
      max-block-size: 16rem;
      overflow: auto;
      padding-block-end: 0.35rem;
      padding-inline-end: 0.2rem;
    }

    .tasks label {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: start;
      gap: 0.65rem;
      min-block-size: 2.75rem;
      border: 2px solid var(--border, oklch(89% 0.026 79));
      border-radius: 0.7rem;
      padding-block: 0.75rem 0.9rem;
      padding-inline: 0.8rem;
      font-size: 1rem;
      cursor: pointer;
    }

    .tasks label:has(:checked) {
      border-color: var(--text, oklch(21.5% 0.009 82));
      background: color-mix(in oklch, var(--brand, oklch(40% 0.09 170)) 12%, transparent);
    }

    .tasks label:focus-within {
      outline: 2px solid var(--brand, oklch(40% 0.09 170));
      outline-offset: 2px;
    }

    .tasks label.task-search {
      grid-template-columns: 1fr;
      min-block-size: 0;
      border: 0;
      padding: 0;
      background: transparent;
      cursor: auto;
    }

    .tasks label.task-search:focus-within {
      outline: none;
    }

    .task-name {
      min-inline-size: 0;
    }

    .tasks strong,
    .tasks .muted,
    .tasks code {
      display: block;
    }

    .tasks code {
      margin-block-start: 0.2rem;
      overflow-wrap: anywhere;
      white-space: normal;
      color: var(--text-muted, oklch(46% 0.018 81));
      font-family: ui-monospace, "IBM Plex Mono", monospace;
      font-size: 0.8125rem;
      font-style: normal;
      line-height: 1.4;
      text-decoration: none;
    }

    .job-controls {
      max-inline-size: 34rem;
    }

    .job-controls input:not([type="radio"], [type="checkbox"]),
    .job-controls select,
    .job-controls textarea,
    .tree input,
    .tree select,
    .tree textarea {
      inline-size: 100%;
      max-inline-size: none;
    }

    .tree input[inputmode="decimal"],
    .job-controls input[inputmode="decimal"],
    .job-controls input[inputmode="numeric"] {
      max-inline-size: 8rem;
    }

    .check {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.65rem 1rem;
      align-items: end;
      border: 2px solid var(--border, oklch(89% 0.026 79));
      border-radius: 0.7rem;
      padding: 0.85rem;
    }

    .check h2,
    .check dl {
      grid-column: 1;
    }

    .check button {
      grid-column: 2;
      grid-row: 1 / span 2;
    }

    .check h2 {
      margin: 0;
      font-size: 1.15rem;
    }

    @container (max-width: 36rem) {
      .check {
        grid-template-columns: 1fr;
      }

      .check button {
        grid-column: 1;
        grid-row: auto;
      }
    }

    @container (min-width: 52rem) {
      .job-form {
        grid-template-columns: minmax(22rem, 26rem) minmax(0, 34rem);
      }

      .tasks {
        grid-column: 1;
        grid-row: 1;
      }

      .job-controls {
        grid-column: 2;
        grid-row: 1;
      }

      .task-list {
        max-block-size: min(36rem, 70dvh);
      }
    }

    .tree,
    .tree ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .tree ul {
      margin-inline-start: 0.55rem;
      padding-inline-start: 0.75rem;
      border-inline-start: 1px solid var(--border, oklch(89% 0.026 79));
    }

    .tree li {
      margin-block: 0.4rem;
    }

    .tree summary {
      min-block-size: 2rem;
      font-weight: 650;
    }

    .tree label {
      grid-template-columns: minmax(5.5rem, 8.5rem) minmax(0, 1fr);
      align-items: center;
      gap: 0.5rem;
    }

    legend {
      padding: 0;
    }

    summary {
      display: inline-flex;
      align-items: center;
      min-block-size: 2.75rem;
      cursor: pointer;
    }

    .cluster {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: end;
    }

    .once-row {
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      gap: 0.5rem;
      max-inline-size: 100%;
      overflow-x: auto;
    }

    .once-row button {
      flex: none;
      white-space: nowrap;
    }

    input.secret {
      flex: 1 1 auto;
      min-inline-size: 0;
      font-family: ui-monospace, "IBM Plex Mono", monospace;
      white-space: nowrap;
      overflow-x: auto;
      overflow-y: hidden;
    }

    meter {
      inline-size: 100%;
      block-size: 0.75rem;
    }

    .bar {
      display: flex;
      overflow: clip;
      inline-size: 8rem;
      block-size: 0.75rem;
      border-radius: 999px;
      background: var(--border, oklch(89% 0.026 79));

      & > span {
        display: block;
        flex: none;
        block-size: 100%;
        inline-size: var(--fill, 0%);
      }

      &.wide {
        inline-size: 100%;
        margin-block: 0.5rem;
      }
    }

    tr:has([aria-current="true"]),
    tr[data-selected="true"] {
      background: color-mix(in oklch, var(--brand, oklch(40% 0.09 170)) 14%, transparent);
    }

    table.jobs a.action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-block-size: 2.75rem;
      min-inline-size: 2.75rem;
      padding-inline: 0.85rem;
      border: 2px solid var(--text, oklch(21.5% 0.009 82));
      border-radius: 999px;
      color: inherit;
      text-decoration: none;
    }

    table.jobs a.action:focus-visible {
      outline: 2px solid var(--brand, oklch(40% 0.09 170));
      outline-offset: 2px;
    }

    table.jobs th[scope="row"] {
      font-weight: 400;
      color: inherit;
      font-size: inherit;
      letter-spacing: 0;
      text-transform: none;
    }

    table.jobs button.quiet {
      min-block-size: 0;
      border: 0;
      border-radius: 0;
      padding: 0;
      text-align: start;
      white-space: normal;
    }

    table.jobs .state,
    table.jobs .when {
      white-space: nowrap;
    }

    table.jobs tbody tr:not(.nested) > * {
      border-block-end: 0;
      padding-block-end: 0.15rem;
    }

    table.jobs tr.nested td {
      padding-block-start: 0.1rem;
    }

    table.jobs .field {
      display: block;
      color: var(--text-muted, oklch(46% 0.018 81));
      font-size: 0.75rem;
      font-weight: 650;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    table.jobs tr.nested code {
      overflow-wrap: anywhere;
    }

    @container (max-width: 40rem) {
      table.jobs thead {
        display: none;
      }

      table.jobs,
      table.jobs tbody,
      table.jobs tr,
      table.jobs th,
      table.jobs td {
        display: block;
        inline-size: auto;
      }

      table.jobs tr {
        display: grid;
        gap: 0.35rem;
        padding-block: 0.75rem;
      }
    }

    .muted {
      display: block;
      color: var(--text-muted, oklch(46% 0.018 81));
      font-size: 0.875rem;
      overflow-wrap: anywhere;
    }

    .delivered {
      background: var(--fill-delivered, oklch(48.1% 0.091 170));
    }

    .failed_after_payment {
      background: var(--fill-failed, oklch(45.5% 0.171 14));
    }

    .uncertain {
      background: var(--fill-uncertain, oklch(47.3% 0.125 46));
    }

    .pending {
      background: var(--fill-pending, oklch(34.6% 0.074 256));
    }

    .chip {
      display: inline-block;
      border: 1px solid currentColor;
      border-radius: 999px;
      padding-block: 0.1rem;
      padding-inline: 0.5rem;
      font-size: 0.875rem;
      letter-spacing: 0.03em;
      text-transform: uppercase;

      &[data-tone="ok"] {
        color: var(--brand, oklch(40% 0.09 170));
      }

      &[data-tone="bad"] {
        color: var(--danger, oklch(42% 0.16 14));
      }

      &[data-tone="wait"] {
        color: var(--caution, oklch(42% 0.11 48));
      }
    }

    pre {
      overflow: auto;
      max-block-size: 16rem;
      padding: 0.75rem;
      border-radius: 0.5rem;
      background: var(--surface, oklch(95.3% 0.013 82));
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    [role="alert"] {
      color: var(--danger, oklch(42% 0.16 14));
    }

    @container (max-width: 32rem) {
      dl {
        grid-template-columns: 1fr;
      }

      .cluster {
        align-items: stretch;

        & > * {
          flex: 1 1 12rem;
        }
      }
    }

    @supports (interpolate-size: allow-keywords) {
      :host {
        interpolate-size: allow-keywords;
      }

      ::details-content {
        overflow: clip;
        transition:
          block-size 200ms ease,
          content-visibility 200ms allow-discrete;
      }
    }

    @media (hover: hover) and (pointer: fine) {
      button:not(.quiet, :disabled):hover {
        background: color-mix(in oklch, var(--text, oklch(21.5% 0.009 82)) 86%, var(--surface, white));
      }
    }

    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }
  }
`;
