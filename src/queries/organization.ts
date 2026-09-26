import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { usePostHog } from "@posthog/react";
import { toast } from "sonner";
import { LIMIT_COPY, LIMIT_ERROR_CODES } from "@/domain/limits";
import type { Role } from "@/domain/permission";
import { useActor } from "@/hooks/useActor";
import { authClient } from "@/lib/auth-client";
import { getMyOrganizationCount, getOrgUsage } from "@/server/organization";
import { accountKeys, orgKeys } from "./keys";
import { toastMutationError, unwrap, useOrgId } from "./mutation";

export const myOrganizationCountQuery = (userId: string) =>
	queryOptions({
		queryKey: accountKeys.organizationCount(userId),
		queryFn: () => getMyOrganizationCount(),
	});

export const orgUsageQuery = (orgId: string) =>
	queryOptions({
		queryKey: orgKeys.usage(orgId),
		queryFn: () => getOrgUsage(),
	});

export const orgInvitationsQuery = (orgId: string) =>
	queryOptions({
		queryKey: orgKeys.invitations(orgId),
		queryFn: () =>
			unwrap(authClient.organization.listInvitations({ query: { organizationId: orgId } })),
	});

/**
 * Active org changed (switch / create / accept / delete). Navigate first: root `beforeLoad` re-runs
 * (fresh session + member role) and old-org views unmount; `invalidate` covers `to` === current
 * page. Then drop the old tenant's cache so back-nav can't show it.
 */
function useResetToOrg() {
	const qc = useQueryClient();
	const router = useRouter();
	const previousOrgId = useActor()?.organizationId;
	return async (to: "/dashboard" | "/onboarding/create") => {
		await router.navigate({ to });
		await router.invalidate();
		if (previousOrgId) qc.removeQueries({ predicate: (q) => q.queryKey[1] === previousOrgId });
	};
}

export function useSwitchOrganization() {
	const reset = useResetToOrg();
	return async (organizationId: string) => {
		const { error } = await authClient.organization.setActive({ organizationId });
		if (error) {
			toastMutationError("Organization", "Could not switch organization")(error);
			return;
		}
		await reset("/dashboard");
	};
}

type OrgInput = { name: string; slug: string };

const SLUG_TAKEN = "SLUG_TAKEN";

export function useCreateOrganization() {
	const posthog = usePostHog();
	const reset = useResetToOrg();
	return useMutation({
		mutationFn: async (values: OrgInput) => {
			const { data } = await authClient.organization.checkSlug({ slug: values.slug });
			if (!data?.status) {
				throw Object.assign(new Error("Organization slug already exist"), { code: SLUG_TAKEN });
			}
			return unwrap(
				authClient.organization.create({
					...values,
					keepCurrentActiveOrganization: false,
					metadata: {},
				})
			);
		},
		onSuccess: async (_data, values) => {
			posthog.capture("organization_created", {
				organization_name: values.name,
				organization_slug: values.slug,
			});
			toast.success("Organization created successfully", {
				description: "You can now access your organization. Redirecting you to dashboard",
			});
			await reset("/dashboard");
		},
		onError: (error, values) => {
			const code = (error as { code?: string }).code;
			if (code === SLUG_TAKEN) {
				posthog.capture("organization_create_failed", {
					reason: "slug_conflict",
					slug: values.slug,
				});
				toast.error("Organization slug already exist", { description: "Please try another slug." });
				return;
			}
			posthog.capture("organization_create_failed", {
				reason: code === LIMIT_ERROR_CODES.org ? "org_limit" : "server_error",
				name: values.name,
				slug: values.slug,
			});
			toastMutationError(
				"Failed to create organization",
				"Please try again later.",
				LIMIT_COPY.orgCreate
			)(error);
		},
	});
}

export const isSlugTaken = (error: unknown) => (error as { code?: string })?.code === SLUG_TAKEN;

export function useUpdateOrganization() {
	const posthog = usePostHog();
	const orgId = useOrgId();
	return useMutation({
		mutationFn: (values: { name: string }) =>
			unwrap(authClient.organization.update({ organizationId: orgId, data: values })),
		onSuccess: () => {
			posthog.capture("organization_settings_updated", { organization_id: orgId });
			toast.success("Organization", { description: "Organization updated successfully" });
		},
		onError: toastMutationError("Failed to update organization", "Please try again later."),
	});
}

export function useDeleteOrganization() {
	const posthog = usePostHog();
	const orgId = useOrgId();
	const reset = useResetToOrg();
	return useMutation({
		mutationFn: () => unwrap(authClient.organization.delete({ organizationId: orgId })),
		onSuccess: async () => {
			posthog.capture("organization_deleted", { organization_id: orgId });
			toast.success("Organization", { description: "Organization deleted successfully" });
			await reset("/onboarding/create");
		},
		onError: toastMutationError("Failed to delete organization", "Please try again later."),
	});
}

type InviteInput = { email: string; role: Role };

export function useInviteMember() {
	const qc = useQueryClient();
	const orgId = useOrgId();
	const posthog = usePostHog();
	return useMutation({
		mutationFn: (values: InviteInput) =>
			unwrap(authClient.organization.inviteMember({ ...values, resend: true })),
		onSuccess: async (_data, values) => {
			posthog.capture("org_member_invited", { role: values.role });
			toast.success("Member", { description: "Member invited successfully" });
			await Promise.all([
				qc.invalidateQueries({ queryKey: orgKeys.usage(orgId) }),
				qc.invalidateQueries({ queryKey: orgKeys.invitations(orgId) }),
			]);
		},
		onError: toastMutationError("Member", "Member could not be invited", LIMIT_COPY.memberInvite),
	});
}

export function useResendInvitation() {
	const qc = useQueryClient();
	const orgId = useOrgId();
	const posthog = usePostHog();
	return useMutation({
		mutationFn: (invite: { id: string } & InviteInput) =>
			unwrap(
				authClient.organization.inviteMember({
					email: invite.email,
					role: invite.role,
					resend: true,
				})
			),
		onSuccess: async (_data, invite) => {
			posthog.capture("org_member_invite_resend", { inviteId: invite.id });
			toast.success("Invitation", { description: "Invitation resent successfully" });
			await qc.invalidateQueries({ queryKey: orgKeys.invitations(orgId) });
		},
		onError: toastMutationError("Invitation", "Invitation could not be resent"),
	});
}

export function useCancelInvitation() {
	const qc = useQueryClient();
	const orgId = useOrgId();
	return useMutation({
		mutationFn: (invitationId: string) =>
			unwrap(authClient.organization.cancelInvitation({ invitationId })),
		onSuccess: async () => {
			toast.success("Invitation", { description: "Invitation cancelled successfully" });
			await Promise.all([
				qc.invalidateQueries({ queryKey: orgKeys.usage(orgId) }),
				qc.invalidateQueries({ queryKey: orgKeys.invitations(orgId) }),
			]);
		},
		onError: toastMutationError("Invitation", "Invitation could not be cancelled"),
	});
}

export function useRemoveMember() {
	const qc = useQueryClient();
	const orgId = useOrgId();
	const posthog = usePostHog();
	return useMutation({
		mutationFn: (memberId: string) =>
			unwrap(authClient.organization.removeMember({ memberIdOrEmail: memberId })),
		onSuccess: async (_data, memberId) => {
			posthog.capture("org_member_removed", { member_id: memberId });
			toast.success("Member", { description: "Member removed successfully" });
			await qc.invalidateQueries({ queryKey: orgKeys.usage(orgId) });
		},
		onError: toastMutationError("Member", "Member could not be removed"),
	});
}

export function useChangeRole() {
	const posthog = usePostHog();
	return useMutation({
		mutationFn: (values: { memberId: string; role: Role }) =>
			unwrap(authClient.organization.updateMemberRole(values)),
		onSuccess: (_data, values) => {
			posthog.capture("org_member_role_changed", {
				member_id: values.memberId,
				role: values.role,
			});
			toast.success("Member", { description: "Role changed successfully" });
		},
		onError: toastMutationError("Member", "Role could not be changed"),
	});
}

export function useAcceptInvitation() {
	const posthog = usePostHog();
	const reset = useResetToOrg();
	return useMutation({
		mutationFn: (invite: { invitationId: string; organizationName?: string }) =>
			unwrap(authClient.organization.acceptInvitation({ invitationId: invite.invitationId })),
		onSuccess: async (_data, invite) => {
			posthog.capture("invitation_accepted", {
				invitation_id: invite.invitationId,
				organization_name: invite.organizationName,
			});
			toast.success("Invitation", { description: "Invitation accepted successfully" });
			await reset("/dashboard");
		},
		onError: toastMutationError("Invitation", "Failed to accept invitation", LIMIT_COPY.orgAccept),
	});
}

export function useRejectInvitation() {
	const posthog = usePostHog();
	const router = useRouter();
	return useMutation({
		mutationFn: (invite: { invitationId: string; organizationName?: string }) =>
			unwrap(authClient.organization.rejectInvitation({ invitationId: invite.invitationId })),
		onSuccess: async (_data, invite) => {
			posthog.capture("invitation_rejected", {
				invitation_id: invite.invitationId,
				organization_name: invite.organizationName,
			});
			toast.success("Invitation", { description: "Invitation rejected successfully" });
			// Invitations list is the route loader (user-scoped, pre-org).
			await router.invalidate();
		},
		onError: toastMutationError("Invitation", "Failed to reject invitation"),
	});
}
