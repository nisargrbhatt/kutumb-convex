import { useQueryClient } from "@tanstack/react-query";
import { usePostHog } from "@posthog/react";
import { toast } from "sonner";
import type { ChangeRequestKind } from "@/domain/changeRequest";
import { submitErrorFeedback, submitFeedback } from "@/domain/memberRequests";
import type { SubmitResult } from "@/domain/profileChanges";
import {
	addressKeys,
	auditKeys,
	changeRequestKeys,
	orgKeys,
	profileKeys,
	relationKeys,
} from "./keys";
import { isAppError } from "@/domain/errors";
import { limitMessage } from "@/domain/limits";
import { useActor } from "@/hooks/useActor";

/**
 * After any profile / relation / address / lifecycle change (all go through the mutation seam):
 * refresh every view it can touch, incl. Change Requests and Audit Events.
 */
export function useInvalidateProfileChange() {
	const qc = useQueryClient();
	const orgId = useOrgId();
	return () =>
		Promise.all(
			[
				profileKeys.all(orgId),
				relationKeys.all(orgId),
				addressKeys.all(orgId),
				changeRequestKeys.all(orgId),
				auditKeys.all(orgId),
				orgKeys.usage(orgId),
			].map((queryKey) => qc.invalidateQueries({ queryKey }))
		);
}

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

/**
 * Toast + analytics for a seam submit (`applied` / `requested` / `unchanged`). Returns whether
 * anything was written (caller invalidates only then).
 */
export function useNotifySubmit() {
	const posthog = usePostHog();
	return (outcome: SubmitResult["outcome"], kind: ChangeRequestKind, appliedTitle: string) => {
		const f = submitFeedback(outcome, appliedTitle);
		if (f.type === "info") toast.info(f.title, { description: f.description });
		else toast.success(f.title, { description: f.description });
		if (outcome === "requested") posthog.capture("change_request_submitted", { kind });
		return outcome !== "unchanged";
	};
}

/** Submit error toast: `Stale` → "Profile changed, reload" (with Reload), else generic copy. */
export function toastSubmitError(title: string, fallback: string) {
	const generic = toastMutationError(title, fallback);
	return (error: unknown) => {
		const stale = submitErrorFeedback(error);
		if (!stale) return generic(error);
		toast.error(stale.title, {
			description: stale.description,
			action: { label: "Reload", onClick: () => window.location.reload() },
		});
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
