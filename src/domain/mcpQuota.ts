/** Write quota rules for AI Client Connections (ADR 0007). Pure; counting lives in queries/writeQuota. */
import { AppError } from "./errors";

/** Burst: write-tool calls per minute per Connection. Mirrors the CF RL binding in wrangler.jsonc. */
export const WRITE_BURST_LIMIT = 10;
/** Applied + requested changes per rolling 24h per Connection, all kinds pooled. */
export const WRITE_DAILY_LIMIT = 200;
/** `create_profile` sub-cap inside the daily pool. */
export const CREATE_DAILY_LIMIT = 50;
export const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;

/** `AppError.code` of a write-quota `LimitReached` (not a `LIMIT_ERROR_CODES` app limit). */
export const WRITE_QUOTA_CODE = "WRITE_QUOTA_REACHED";

/** Whole minutes, at least 1, until `resetsAt` (ms epoch). */
export const minutesUntil = (resetsAt: number, now: number) =>
	Math.max(1, Math.ceil((resetsAt - now) / 60_000));

/** Tool-level quota failure: never HTTP 429 (an `isError` tool result). */
export const writeQuotaError = (minutes: number) =>
	new AppError("LimitReached", `Write quota reached, resets in ~${minutes} min.`, WRITE_QUOTA_CODE);
