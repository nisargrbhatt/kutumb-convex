import { authMiddleware } from "@/middleware/auth";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";
import { db } from "@/db";
import { queryOptions } from "@tanstack/react-query";
import { COMMUNITY_ADDRESS_TYPE } from "@/db/constants";
import { communityAddress } from "@/db/app-schema";
import { generatePrimaryKey } from "@/lib/generate";
import { eq } from "drizzle-orm";

export const getMyCommunityAddresses = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const organizationId = context?.session?.session?.activeOrganizationId;

		if (typeof organizationId !== "string") {
			throw new Error("No Organization Id found");
		}

		const profile = await db.query.communityProfile.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.organizationId, organizationId),
					operators.eq(fields.userId, context.userId)
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

export const getMyCommunityAddressesQuery = () =>
	queryOptions({
		queryKey: ["get-my-community-addresses"],
		queryFn: async () => {
			const result = await getMyCommunityAddresses();
			return result;
		},
	});

export const addMyCommunityAddress = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
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
		})
	)
	.handler(async ({ context, data }) => {
		const organizationId = context?.session?.session?.activeOrganizationId;

		if (typeof organizationId !== "string") {
			throw new Error("No Organization Id found");
		}

		const profile = await db.query.communityProfile.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.organizationId, organizationId),
					operators.eq(fields.userId, context.userId)
				),
			columns: {
				id: true,
			},
		});

		if (!profile) {
			throw new Error("Community profile not found");
		}

		await db.insert(communityAddress).values({
			id: generatePrimaryKey(),
			communityProfileId: profile.id,
			line1: data.line1,
			line2: data.line2,
			country: data.country,
			state: data.state,
			city: data.city,
			postalCode: data.postalCode,
			type: data.type,
			note: data.note,
			digipin: data.digipin,
		});

		return {
			message: "Address added successfully",
		};
	});

export const deleteMyCommunityAddress = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			id: z.string().trim().min(1, "Address ID is required"),
		})
	)
	.handler(async ({ context, data }) => {
		const organizationId = context?.session?.session?.activeOrganizationId;

		if (typeof organizationId !== "string") {
			throw new Error("No Organization Id found");
		}

		const profile = await db.query.communityProfile.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.organizationId, organizationId),
					operators.eq(fields.userId, context.userId)
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
					operators.eq(fields.id, data.id),
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
