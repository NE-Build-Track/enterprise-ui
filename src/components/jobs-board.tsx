"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, type FormEvent, type ReactNode } from "react";

import { GyralElement } from "@/components/GyralElement";
import { loadJobList } from "@/gyral/loaders";
import { billingCurrency, jobStateLabel } from "@/lib/job-copy";
import { filterJobs, JOB_LIST_LIMIT, JOB_PAGE_SIZE, paginate, readJobFilters } from "@/lib/job-history";
import type { Job } from "@/lib/engine/types";

import { useConsoleData } from "./use-console";

const STATES: readonly Job["state"][] = ["queued", "running", "succeeded", "failed", "uncertain"];

function fieldText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function FilterControl({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return <label>{label}{children}</label>;
}

export function JobsBoard() {
  const data = useConsoleData();
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const filters = readJobFilters(new URLSearchParams(params.toString()));
  const filtered = useMemo(() => filterJobs(data.jobs, filters), [data.jobs, filters]);
  const page = paginate(filtered, filters.page, JOB_PAGE_SIZE);
  const currency = billingCurrency(data.allowance?.available, data.allowance?.spent, data.allowance?.granted);
  const apps = useMemo(
    () => [...new Set(data.jobs.map((job) => job.app))].sort((left, right) => left.localeCompare(right)),
    [data.jobs],
  );
  const costList = page.items.flatMap((job) => {
    const cost = data.costs.get(job.id);
    return cost ? [cost] : [];
  });

  function apply(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const key of ["q", "state", "app", "from", "to"] as const) {
      const value = fieldText(form, key);
      if (value) next.set(key, value);
    }
    const ids = params.get("ids");
    if (ids) next.set("ids", ids);
    const text = next.toString();
    router.replace(text ? `${pathname}?${text}` : pathname);
  }

  function pageHref(number: number): string {
    const next = new URLSearchParams(params.toString());
    if (number <= 1) next.delete("page");
    else next.set("page", String(number));
    const text = next.toString();
    return text ? `${pathname}?${text}` : pathname;
  }

  return (
    <>
      <hgroup>
        <h1>Jobs</h1>
        <p>Find a result or open a failed job. Newest jobs are first.</p>
      </hgroup>
      <search className="panel filters">
        <form key={params.toString()} onSubmit={apply}>
          <FilterControl label="Search"><input name="q" defaultValue={filters.q} placeholder="Name or ID" /></FilterControl>
          <FilterControl label="Status"><select name="state" defaultValue={filters.state}>
              <option value="">Any status</option>
              {STATES.map((state) => (
                <option key={state} value={state}>
                  {jobStateLabel(state)}
                </option>
              ))}
            </select></FilterControl>
          <FilterControl label="Task"><select name="app" defaultValue={filters.app}>
              <option value="">Any task</option>
              {apps.map((app) => (
                <option key={app} value={app}>
                  {app}
                </option>
              ))}
            </select></FilterControl>
          <FilterControl label="From"><input name="from" type="date" defaultValue={filters.from} /></FilterControl>
          <FilterControl label="To"><input name="to" type="date" defaultValue={filters.to} /></FilterControl>
          <button type="submit">Apply</button>
        </form>
      </search>
      {data.jobs.length >= JOB_LIST_LIMIT ? <p>History is capped at {JOB_LIST_LIMIT} jobs.</p> : null}
      {data.jobsError ? null : (
        <p>{data.loaded ? `${filtered.length} jobs. Page ${page.page} of ${page.pages}.` : "Loading jobs"}</p>
      )}
      {data.jobsError ? <p role="alert">{data.jobsError}</p> : null}
      {data.loaded && !data.jobsError && filtered.length === 0 ? (
        <output>{data.jobs.length === 0 ? "No jobs yet." : "No jobs match these filters."}</output>
      ) : null}
      {data.loaded && filtered.length > 0 ? (
        <GyralElement
          tag="lp-job-list"
          load={loadJobList}
          label="Jobs"
          props={{ jobs: page.items, error: data.jobsError, currency, costs: costList }}
        />
      ) : null}
      <nav aria-label="Job pages" className="cluster">
        {page.page > 1 ? <Link href={pageHref(page.page - 1)}>Previous</Link> : <span>Previous</span>}
        {page.page < page.pages ? <Link href={pageHref(page.page + 1)}>Next</Link> : <span>Next</span>}
      </nav>
    </>
  );
}
