import { authMiddleware } from "@/middleware/auth";
import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import * as z from "zod";
import { getFullUserContextCached, getUserProfileContext } from "./auth";
import { polar } from "@/lib/polar";
import { env } from "cloudflare:workers";
import { db } from "@/db";
import type { PrimaryKey } from "@/db/schema";
import { organization, organizationMember } from "@/db/schema";
import { generateOrgSlug, generatePrimaryKey } from "@/lib/generate";
import { eq } from "drizzle-orm";

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
