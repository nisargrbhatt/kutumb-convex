export type AppErrorKind = "NotFound" | "Forbidden" | "LimitReached" | "NoActiveOrg";

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
