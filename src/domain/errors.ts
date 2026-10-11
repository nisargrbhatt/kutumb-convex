export type AppErrorKind =
	| "NotFound"
	| "Forbidden"
	| "LimitReached"
	| "NoActiveOrg"
	/** Version mismatch / approve blocked: the record changed since it was read. */
	| "Stale"
	/** Concurrent write tripped a guard (e.g. request already closed). */
	| "Conflict"
	/** Domain rule broken (self-relation, duplicate pair, reassign a draft). */
	| "Invalid";

export class AppError extends Error {
	name = "AppError" as const;

	constructor(
		public kind: AppErrorKind,
		message?: string,
		public code?: string
	) {
		super(message ?? kind);
	}
}

export const isAppError = (e: unknown): e is AppError =>
	typeof e === "object" && e !== null && (e as { name?: unknown }).name === "AppError";
