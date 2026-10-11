import { createSerializationAdapter } from "@tanstack/react-router";
import { createStart } from "@tanstack/react-start";
import { AppError, type AppErrorKind } from "@/domain/errors";

/**
 * Server fn errors cross the wire as plain `Error` (message only) by default, so client
 * `isAppError` / `error.kind` checks (Stale toast, limit copy, NotFound) never matched.
 * Keep `kind` + `code`.
 */
const appErrorAdapter = createSerializationAdapter({
	key: "AppError",
	test: (v: unknown): v is AppError => v instanceof AppError,
	toSerializable: (e: AppError) => ({ kind: e.kind, message: e.message, code: e.code ?? null }),
	fromSerializable: (v: { kind: AppErrorKind; message: string; code: string | null }) =>
		new AppError(v.kind, v.message, v.code ?? undefined),
});

export const startInstance = createStart(() => ({
	serializationAdapters: [appErrorAdapter],
}));
