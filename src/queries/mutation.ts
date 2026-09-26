import { toast } from "sonner";
import { isAppError } from "@/domain/errors";
import { limitMessage } from "@/domain/limits";
import { useActor } from "@/hooks/useActor";

type Copy = { readonly title: string; readonly description: string };

/** Active org of the current actor; mutation hooks only mount under `_community`. */
export function useOrgId(): string {
	const actor = useActor();
	if (!actor) throw new Error("useOrgId: no active organization");
	return actor.organizationId;
}

const errorCode = (e: unknown) => (isAppError(e) ? e.code : (e as { code?: unknown } | null)?.code);

/**
 * Toast a failed mutation. Limit codes (server `AppError` or better-auth `{ code }`) map to
 * `LIMIT_COPY`; `limitCopy` overrides the generic copy for sites with their own wording.
 */
export function toastMutationError(title: string, fallback: string, limitCopy?: Copy) {
	return (error: unknown) => {
		console.error(error);
		const code = errorCode(error);
		const limit = typeof code === "string" ? limitMessage(code) : undefined;
		if (limit) {
			const copy = limitCopy ?? limit;
			toast.error(copy.title, { description: copy.description });
			return;
		}
		const message = error instanceof Error ? error.message : undefined;
		toast.error(title, { description: message || fallback });
	};
}

type BetterAuthResult<T> = { data: T | null; error: { code?: string; message?: string } | null };

/** better-auth client returns `{ data, error }`; mutations want a throw carrying `code`. */
export async function unwrap<T>(result: Promise<BetterAuthResult<T>>): Promise<T> {
	const { data, error } = await result;
	if (error) {
		throw Object.assign(new Error(error.message ?? "Request failed"), { code: error.code });
	}
	return data as T;
}
