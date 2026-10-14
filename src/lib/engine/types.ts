import type { components } from "./schema";

export type Schemas = components["schemas"];
export type EngineHealth = Schemas["EngineHealth"];
export type AccessKey = Schemas["AccessKey"];
export type IssuedKey = Schemas["IssuedKey"];
export type IssueKeyBody = Schemas["IssueKeyBody"];
export type Allowance = Schemas["Allowance"];
export type Money = Schemas["Money-Output"];
export type CostSummary = Schemas["CostSummary"];
export type Fees = Schemas["Fees"];
export type Job = Schemas["Job"];
export type JobCost = Schemas["JobCost"];
export type JobRequest = Schemas["JobRequest"];
export type Offering = Schemas["Offering"];
export type Runner = Schemas["Runner"];
export type Reconciliation = Schemas["Reconciliation"];
export type SyncReport = Schemas["SyncReport"];
export type Attempt = Schemas["Attempt"];
export type NetworkRate = Schemas["NetworkRate"];

export const COST_CLASSES = ["delivered", "failed_after_payment", "uncertain", "pending"] as const;
export type CostClass = (typeof COST_CLASSES)[number];
