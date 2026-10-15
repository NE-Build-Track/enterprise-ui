import { call, command, define, defineDriver, each, html, outputs, prop, type TemplateResult } from "@gyral/core";

import type { AccessKey } from "@/lib/engine/types";

import { isAccessKey, isRecord, listOf, orNull, sameJson } from "./guards";
import { widgetStyles } from "./styles";

export type KeyTableOutput =
  | { readonly _tag: "IssueKey"; readonly actorId: string; readonly label: string }
  | { readonly _tag: "RevokeKey"; readonly keyId: string }
  | { readonly _tag: "DismissKey" };

type Issued = { readonly token: string; readonly actorId: string };

type Props = {
  readonly keys: readonly AccessKey[];
  readonly error: string;
  readonly issued: Issued | null;
};

type State = {
  readonly actorId: string;
  readonly label: string;
  readonly pendingKeyId: string;
  readonly copied: boolean;
  readonly dismissed: boolean;
  readonly copyError: string;
};

type Msg =
  | { readonly _tag: "Actor"; readonly value: string }
  | { readonly _tag: "Label"; readonly value: string }
  | { readonly _tag: "Issue"; readonly actorId: string; readonly label: string }
  | { readonly _tag: "Ask"; readonly keyId: string }
  | { readonly _tag: "Cancel" }
  | { readonly _tag: "Confirm" }
  | { readonly _tag: "Copy"; readonly token: string }
  | { readonly _tag: "Copied" }
  | { readonly _tag: "CopyFailed"; readonly message: string }
  | { readonly _tag: "Select" }
  | { readonly _tag: "Dismiss" };

const clipboard = defineDriver<string, undefined, string>({
  name: "clipboard",
  run: async (text) => {
    await navigator.clipboard.writeText(text);
    return undefined;
  },
  toError: (cause) => (cause instanceof Error ? cause.message : "The key could not be copied."),
});

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
  init: () => ({ actorId: "", label: "", pendingKeyId: "", copied: false, dismissed: false, copyError: "" }),
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
    Copy: (_input, ctx) => {
      const token = ctx.props.issued?.token;
      return token && !ctx.state.dismissed ? { _tag: "Copy", token } : undefined;
    },
    Select: true,
    Dismiss: true,
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
    Copy: (s, m) => [
      { ...s, copyError: "" },
      [
        command(clipboard, m.token, {
          onSuccess: () => ({ _tag: "Copied" }),
          onFailure: (message) => ({ _tag: "CopyFailed", message }),
        }),
      ],
    ],
    Copied: (s) => [{ ...s, copied: true, copyError: "" }, [call("#issued-key", "focus"), call("#issued-key", "select")]],
    CopyFailed: (s, m) => [
      { ...s, copied: false, copyError: m.message },
      [call("#issued-key", "focus"), call("#issued-key", "select")],
    ],
    Select: (s) => [s, [call("#issued-key", "select")]],
    Dismiss: (s) => [{ ...s, dismissed: true, copied: false, copyError: "" }, [emit({ _tag: "DismissKey" })]],
    PropsChanged: (s, m) =>
      m.props.issued?.token === m.prev.issued?.token ? s : { ...s, copied: false, dismissed: false, copyError: "" },
  },
  view: (s, i, ctx) => html`
    <p>Issuing a key does not move money. The actor must already have an allocation.</p>
    ${ctx.props.error ? html`<p role="alert">${ctx.props.error}</p>` : ""}
    ${
      ctx.props.issued && !s.dismissed
        ? html`<div class="once">
            <p id="issued-note">
              Key for <bdi>${ctx.props.issued.actorId}</bdi>. Shown once. Copy it, then close this. It is not saved in the browser.
            </p>
            <div class="once-row">
              <input
                id="issued-key"
                class="secret"
                readonly
                value=${ctx.props.issued.token}
                autocomplete="off"
                autocapitalize="off"
                autocorrect="off"
                spellcheck="false"
                translate="no"
                data-1p-ignore="true"
                data-lpignore="true"
                data-bwignore="true"
                data-form-type="other"
                aria-labelledby="issued-note"
                data-intent-focus=${i.Select}
              />
              <button type="button" data-intent=${i.Copy}>Copy</button>
              <button type="button" class="quiet" data-intent=${i.Dismiss}>Close</button>
            </div>
            ${s.copied ? html`<p role="status">Copied.</p>` : ""}
            ${s.copyError ? html`<p role="alert">${s.copyError}</p>` : ""}
          </div>`
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
