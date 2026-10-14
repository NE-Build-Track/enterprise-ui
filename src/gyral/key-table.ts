import { define, each, html, outputs, prop, type TemplateResult } from "@gyral/core";

import type { AccessKey } from "@/lib/engine/types";

import { isAccessKey, isRecord, listOf, orNull, sameJson } from "./guards";
import { widgetStyles } from "./styles";

export type KeyTableOutput =
  | { readonly _tag: "IssueKey"; readonly actorId: string; readonly label: string }
  | { readonly _tag: "RevokeKey"; readonly keyId: string };

type Issued = { readonly token: string; readonly actorId: string };

type Props = {
  readonly keys: readonly AccessKey[];
  readonly error: string;
  readonly issued: Issued | null;
};

type State = { readonly actorId: string; readonly label: string; readonly pendingKeyId: string };

type Msg =
  | { readonly _tag: "Actor"; readonly value: string }
  | { readonly _tag: "Label"; readonly value: string }
  | { readonly _tag: "Issue"; readonly actorId: string; readonly label: string }
  | { readonly _tag: "Ask"; readonly keyId: string }
  | { readonly _tag: "Cancel" }
  | { readonly _tag: "Confirm" };

const emit = outputs<KeyTableOutput>();

function isIssued(value: unknown): value is Issued {
  return isRecord(value) && typeof value.token === "string" && typeof value.actorId === "string";
}

const Row = (key: AccessKey): TemplateResult => html`
  <tr>
    <th scope="row"><bdi>${key.actor_id}</bdi></th>
    <td>${key.kind}</td>
    <td>${key.label}</td>
    <td>${key.permissions.map((permission) => html`<code>${permission}</code> `)}</td>
    <td>${key.created_at ? html`<time datetime=${key.created_at}>${key.created_at}</time>` : ""}</td>
    <td>${key.revoked_at ? html`<time datetime=${key.revoked_at}>${key.revoked_at}</time>` : "active"}</td>
    <td>
      ${
        key.revoked_at
          ? ""
          : html`<button type="button" class="quiet" value=${key.key_id} data-intent="Ask">Revoke</button>`
      }
    </td>
  </tr>
`;

export const KeyTable = define<State, Msg, Props, KeyTableOutput>()("lp-key-table", {
  props: {
    keys: prop.value(listOf(isAccessKey), { default: [], equals: sameJson }),
    error: prop.string({ default: "" }),
    issued: prop.value(orNull(isIssued), { default: null, equals: sameJson }),
  },
  styles: widgetStyles,
  init: () => ({ actorId: "", label: "", pendingKeyId: "" }),
  intent: {
    Actor: ({ value }) => ({ _tag: "Actor", value: value ?? "" }),
    Label: ({ value }) => ({ _tag: "Label", value: value ?? "" }),
    Issue: (_input, ctx) => {
      const actorId = ctx.state.actorId.trim();
      return actorId ? { _tag: "Issue", actorId, label: ctx.state.label.trim() } : undefined;
    },
    Ask: ({ value }) => (value ? { _tag: "Ask", keyId: value } : undefined),
    Cancel: true,
    Confirm: true,
  },
  update: {
    Actor: (s, m) => ({ ...s, actorId: m.value }),
    Label: (s, m) => ({ ...s, label: m.value }),
    Issue: (s, m) => [s, [emit({ _tag: "IssueKey", actorId: m.actorId, label: m.label })]],
    Ask: (s, m) => ({ ...s, pendingKeyId: m.keyId }),
    Cancel: (s) => ({ ...s, pendingKeyId: "" }),
    Confirm: (s) =>
      s.pendingKeyId
        ? [{ ...s, pendingKeyId: "" }, [emit({ _tag: "RevokeKey", keyId: s.pendingKeyId })]]
        : s,
  },
  view: (s, i, ctx) => html`
    <p>Issuing a key does not move money. The actor must already have an allocation.</p>
    ${ctx.props.error ? html`<p role="alert">${ctx.props.error}</p>` : ""}
    ${
      ctx.props.issued
        ? html`<p role="status">
            Key for <bdi>${ctx.props.issued.actorId}</bdi>. Shown once: <code>${ctx.props.issued.token}</code>
          </p>`
        : ""
    }
    <form class="cluster" data-intent=${i.Issue}>
      <label>Actor id (required) <input value=${s.actorId} data-intent=${i.Actor} required autocomplete="off" spellcheck="false" /></label>
      <label>Label (optional) <input value=${s.label} data-intent=${i.Label} autocomplete="off" /></label>
      <button type="submit">Issue actor key</button>
    </form>
    <table>
      <caption>Access keys on this application</caption>
      <thead>
        <tr>
          <th scope="col">Actor</th>
          <th scope="col">Kind</th>
          <th scope="col">Label</th>
          <th scope="col">Permissions</th>
          <th scope="col">Created</th>
          <th scope="col">Revoked</th>
          <th scope="col">Action</th>
        </tr>
      </thead>
      <tbody>
        ${each(ctx.props.keys, (key) => key.key_id, Row)}
      </tbody>
    </table>
    ${
      s.pendingKeyId
        ? html`<p id="revoke-prompt">
            Revoke <code>${s.pendingKeyId}</code>? The next request with that key fails authentication.
          </p>
          <p>
            <button type="button" data-intent=${i.Confirm} aria-describedby="revoke-prompt">Confirm revoke</button>
            <button type="button" class="quiet" data-intent=${i.Cancel}>Cancel</button>
          </p>`
        : ""
    }
  `,
});

declare global {
  interface HTMLElementTagNameMap {
    "lp-key-table": InstanceType<typeof KeyTable>;
  }
}
