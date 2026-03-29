import { authMiddleware } from "@/middleware/auth";
import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import * as z from "zod";
import { getFullUserContextCached, getUserProfileContext } from "./auth";
import { polar } from "@/lib/polar";
import { env } from "cloudflare:workers";
import { db } from "@/db";
import type { PrimaryKey } from "@/db/app-schema";
import { organization, organizationMember } from "@/db/app-schema";
import { generateOrgSlug, generatePrimaryKey } from "@/lib/generate";
import { eq } from "drizzle-orm";
import { queryOptions } from "@tanstack/react-query";
import { checkOrgRoleResult } from "@/handler/organization";

export const createOrganizationCheckoutLink = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			name: z.string().trim().min(1, "Name is required"),
			successUrl: z.string().trim().min(1, "Success URL is required"),
			cancelUrl: z.string().trim().min(1, "Cancel URL is required"),
		})
	)
	.handler(async ({ context, data }) => {
		const { profileId } = await getUserProfileContext(context.userId);

		const checkoutLink = await polar.checkouts.create({
			products: [env.POLAR_PRODUCT_ID],
			trialInterval: "day",
			trialIntervalCount: 7,
			allowTrial: true,
			metadata: {
				ownerProfileId: profileId,
				ownerUserId: context.userId,
			},
			customerMetadata: {
				ownerProfileId: profileId,
				ownerUserId: context.userId,
			},
			customerName: data.name,
			successUrl: data.successUrl,
			returnUrl: data.cancelUrl,
		});

		return {
			checkoutId: checkoutLink.id,
			checkoutLink: checkoutLink.url,
		};
	});

const createOrganizationOwnerRecord = createServerOnlyFn(
	async (props: {
		profileId: PrimaryKey<"profile">;
		organizationId: PrimaryKey<"organization">;
		customerId: string;
	}) => {
		const createdOrgMember = await db
			.insert(organizationMember)
			.values({
				id: generatePrimaryKey("organizationMember"),
				organizationId: props.organizationId,
				memberId: props.profileId,
				role: "owner",
			})
			.returning({
				id: organizationMember.id,
			});

		const createdOrgMemberId = createdOrgMember?.at(0)?.id;

		if (!createdOrgMemberId) {
			throw new Error("Failed to create organization member");
		}

		await polar.events.ingest({
			events: [
				{
					customerId: props.customerId,
					name: "user_added",
					metadata: {
						organizationMemberId: createdOrgMemberId,
					},
				},
			],
		});
	}
);

export const createOrganization = createServerOnlyFn(
	async (props: {
		customerId: string;
		organizationName: string;
		subscriptionId: string;
		userId: string;
	}) => {
		const { profileId } = await getUserProfileContext(props.userId);

		const checkOrgExists = await db.query.organization.findFirst({
			where: (fields, ops) => ops.eq(fields.customerId, props.customerId),
			columns: {
				id: true,
			},
		});

		if (checkOrgExists?.id) {
			throw new Error("Organization already exists");
		}

		const createdOrganization = await db
			.insert(organization)
			.values({
				id: generatePrimaryKey("organization"),
				name: props.organizationName,
				description: "Fresh Organization",
				customerId: props.customerId,
				subscriptionId: props.subscriptionId,
				slug: generateOrgSlug(props.organizationName),
			})
			.returning({
				id: organization.id,
			});

		const createdOrganizationId = createdOrganization?.at(0)?.id;

		if (!createdOrganizationId) {
			throw new Error("Failed to create organization");
		}

		await createOrganizationOwnerRecord({
			profileId: profileId,
			organizationId: createdOrganizationId,
			customerId: props.customerId,
		});
	}
);

export const deleteOrganization = createServerOnlyFn(
	async (props: { customerId: string; subscriptionId: string }) => {
		const checkOrgExists = await db.query.organization.findFirst({
			where: (fields, ops) =>
				ops.and(
					ops.eq(fields.customerId, props.customerId),
					ops.eq(fields.subscriptionId, props.subscriptionId)
				),
			columns: {
				id: true,
			},
		});

		if (!checkOrgExists?.id) {
			throw new Error("Organization does not exist");
		}

		await db.delete(organization).where(eq(organization.id, checkOrgExists.id));
	}
);

export const getOrganizationContext = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			slug: z.string().min(1, "slug is required"),
		})
	)
	.middleware([authMiddleware])
	.handler(async ({ context, data }) => {
		const userContext = await getFullUserContextCached(context.userId);

		if (!userContext?.organization) {
			throw new Error("No organization found");
		}

		const org = userContext.organization.find((i) => i.slug === data.slug);

		return { org: org, profile: userContext.profile, allOrg: userContext.organization ?? [] };
	});

export const getOrganizationContextQuery = (props: { slug: string }) =>
	queryOptions({
		queryKey: ["get-organization-context", props.slug],
		queryFn: async ({ signal }) =>
			getOrganizationContext({
				data: {
					slug: props.slug,
				},
				signal,
			}),
	});

export const getOrganizationInfo = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			slug: z.string().min(1, "Organization slug is required"),
		})
	)
	.middleware([authMiddleware])
	.handler(async ({ context, data }) => {
		const checkRoleResult = await checkOrgRoleResult({
			userId: context.userId,
			organizationSlug: data.slug,
			requiredRoles: ["owner"],
		});

		if (!checkRoleResult) {
			throw new Error("You do not have permission to add this resource");
		}

		const organization = await db.query.organization.findFirst({
			where: (fields, ops) => ops.eq(fields.id, checkRoleResult.id),
			columns: {
				id: true,
				name: true,
				slug: true,
				description: true,
			},
		});

		if (!organization) {
			throw new Error("Organization not found");
		}

		return organization;
	});

export const getOrganizationInfoQuery = (props: { slug: string }) =>
	queryOptions({
		queryKey: ["get-organization-info", props.slug],
		queryFn: async ({ signal }) =>
			getOrganizationInfo({
				data: {
					slug: props.slug,
				},
				signal,
			}),
	});

export const updateOrganizationInfo = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			slug: z.string(),
			organization: z.object({
				description: z.string(),
			}),
		})
	)
	.handler(async ({ context, data }) => {
		const checkRoleResult = await checkOrgRoleResult({
			userId: context.userId,
			organizationSlug: data.slug,
			requiredRoles: ["owner"],
		});

		if (!checkRoleResult) {
			throw new Error("You do not have permission to update this organization");
		}

		await db
			.update(organization)
			.set({
				description: data.organization.description,
			})
			.where(eq(organization.id, checkRoleResult.id));

		return {
			message: "Organization updated successfully",
		};
	});

export const checkCurrentOrgPaymentSetup = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const currentOrgId = context.session?.session?.activeOrganizationId;
		if (typeof currentOrgId !== "string") {
			throw new Error("No current Organization found");
		}

		const currentOrg = await db.query.organization.findFirst({
			where: (fields, op) => op.eq(fields.id, currentOrgId),
			columns: {
				metadata: true,
			},
		});

		if (!currentOrg) {
			throw new Error("Organization not found");
		}

		try {
			const metadata = JSON.parse(currentOrg?.metadata ?? "{}");
			const paymentSetup = metadata?.paymentSetup;
			return { paymentSetup: Boolean(paymentSetup) };
		} catch (error) {
			console.error(error, "Error parsing metadata");
			return { paymentSetup: false };
		}
	});

export const checkCurrentOrgPaymentSetupQuery = () =>
	queryOptions({
		queryKey: ["check-current-org-payment-setup"],
		queryFn: async ({ signal }) =>
			checkCurrentOrgPaymentSetup({
				signal,
			}),
		refetchInterval: (query) => {
			const paymentSetup = query?.state?.data?.paymentSetup;
			if (paymentSetup) {
				return false;
			}
			return 5 * 1000;
		},
	});
