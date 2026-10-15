"use client";

import { createElement, useEffect, useLayoutEffect, useRef, useState } from "react";

type Props = {
  readonly tag: string;
  readonly load: () => Promise<unknown>;
  readonly props: Readonly<Record<string, unknown>>;
  readonly onOutput?: (detail: unknown) => void;
  readonly label: string;
};

export function GyralElement({ tag, load, props, onOutput, label }: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void load()
      .then(async () => {
        await customElements.whenDefined(tag);
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load, tag]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !ready) return;
    for (const [key, value] of Object.entries(props)) {
      Reflect.set(element, key, value);
    }
  }, [props, ready]);

  useEffect(() => {
    const element = ref.current;
    if (!element || !onOutput) return;
    const listener = (event: Event) => {
      if (event instanceof CustomEvent) onOutput(event.detail);
    };
    element.addEventListener("gyral-output", listener);
    return () => element.removeEventListener("gyral-output", listener);
  }, [onOutput, ready]);

  return (
    <>
      {ready ? null : (
        <p role="status">
          Loading {label}
        </p>
      )}
      {createElement(tag, { ref, hidden: !ready })}
    </>
  );
}
