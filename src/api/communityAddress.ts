import { authMiddleware } from "@/middleware/auth";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";
import { getFullUserContextCached } from "./auth";
import { db } from "@/db";
import { queryOptions } from "@tanstack/react-query";
import { COMMUNITY_ADDRESS_TYPE } from "@/db/constants";
import type { PrimaryKey } from "@/db/app-schema";
import { communityAddress } from "@/db/app-schema";
import { generatePrimaryKey } from "@/lib/generate";
import { eq } from "drizzle-orm";

export const getMyCommunityAddresses = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			slug: z.string().trim().min(1, "Slug is required"),
		})
	)
	.handler(async ({ context, data }) => {
		const cachedUserContext = await getFullUserContextCached(context.userId);

		if (!cachedUserContext) {
			throw new Error("User not found");
		}

		const profileId = cachedUserContext.profile?.id;

		const organizationId = cachedUserContext?.organization?.find((o) => o.slug === data.slug)?.id;

		if (!organizationId) {
			throw new Error("Organization not found");
		}
		const profile = await db.query.communityProfile.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.organizationId, organizationId),
					operators.eq(fields.profileId, profileId)
				),
			columns: {
				id: true,
			},
		});

		if (!profile) {
			return [];
		}

		const addresses = await db.query.communityAddress.findMany({
			where: (fields, operators) => operators.eq(fields.communityProfileId, profile.id),
		});

		return addresses;
	});

export const getMyCommunityAddressesQuery = (props: { slug: string }) =>
	queryOptions({
		queryKey: ["get-my-community-addresses", props.slug],
		queryFn: async ({ signal }) => {
			const result = await getMyCommunityAddresses({
				data: {
					slug: props.slug,
				},
				signal,
			});
			return result;
		},
	});

export const addMyCommunityAddress = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			slug: z.string().trim().min(1, "Slug is required"),
			address: z.object({
				line1: z.string().min(1, "Line 1 is required"),
				line2: z.string().optional(),
				country: z.string().min(1, "Country is required"),
				state: z.string().min(1, "State is required"),
				city: z.string().min(1, "City is required"),
				postalCode: z.string().min(1, "Postal code is required"),
				type: z
					.enum([
						COMMUNITY_ADDRESS_TYPE.home,
						COMMUNITY_ADDRESS_TYPE.work,
						COMMUNITY_ADDRESS_TYPE.other,
					])
					.optional(),
				note: z.string().optional(),
				digipin: z.string().optional(),
			}),
		})
	)
	.handler(async ({ context, data }) => {
		const cachedUserContext = await getFullUserContextCached(context.userId);

		if (!cachedUserContext) {
			throw new Error("User not found");
		}

		const profileId = cachedUserContext.profile?.id;

		const organizationId = cachedUserContext?.organization?.find((o) => o.slug === data.slug)?.id;

		if (!organizationId) {
			throw new Error("Organization not found or you are not a member");
		}

		const profile = await db.query.communityProfile.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.organizationId, organizationId),
					operators.eq(fields.profileId, profileId)
				),
			columns: {
				id: true,
			},
		});

		if (!profile) {
			throw new Error("Community profile not found");
		}

		await db.insert(communityAddress).values({
			id: generatePrimaryKey("communityAddress"),
			communityProfileId: profile.id,
			line1: data.address.line1,
			line2: data.address.line2,
			country: data.address.country,
			state: data.address.state,
			city: data.address.city,
			postalCode: data.address.postalCode,
			type: data.address.type,
			note: data.address.note,
			digipin: data.address.digipin,
		});

		return {
			message: "Address added successfully",
		};
	});

export const deleteMyCommunityAddress = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			slug: z.string().trim().min(1, "Slug is required"),
			id: z.string().trim().min(1, "Address ID is required"),
		})
	)
	.handler(async ({ context, data }) => {
		const cachedUserContext = await getFullUserContextCached(context.userId);

		if (!cachedUserContext) {
			throw new Error("User not found");
		}

		const profileId = cachedUserContext.profile?.id;

		const organizationId = cachedUserContext?.organization?.find((o) => o.slug === data.slug)?.id;

		if (!organizationId) {
			throw new Error("Organization not found or you are not a member");
		}

		const profile = await db.query.communityProfile.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.organizationId, organizationId),
					operators.eq(fields.profileId, profileId)
				),
			columns: {
				id: true,
			},
		});

		if (!profile) {
			throw new Error("Community profile not found");
		}

		const address = await db.query.communityAddress.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.id, data.id as PrimaryKey<"communityAddress">),
					operators.eq(fields.communityProfileId, profile.id)
				),
			columns: {
				id: true,
			},
		});

		if (!address) {
			throw new Error("Address not found or does not belong to you");
		}

		await db.delete(communityAddress).where(eq(communityAddress.id, address.id));

		return {
			message: "Address deleted successfully",
		};
	});
