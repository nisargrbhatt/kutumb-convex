import { authMiddleware } from "@/middleware/auth";
import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import * as z from "zod";
import { getUserProfileContext } from "./auth";
import { polar } from "@/lib/polar";
import { env } from "cloudflare:workers";
import { db } from "@/db";
import { organization } from "@/db/schema";
import { generateOrgSlug, generatePrimaryKey } from "@/lib/generate";

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

export const createOrganization = createServerOnlyFn(
	async (props: {
		customerId: string;
		organizationName: string;
		subscriptionId: string;
		userId: string;
	}) => {
		const { profileId } = await getUserProfileContext(props.userId);

		const createdOrganization = await db.insert(organization).values({
			id: generatePrimaryKey("organization"),
			name: props.organizationName,
			description: "Fresh Organization",
			customerId: props.customerId,
			subscriptionId: props.subscriptionId,
			slug: generateOrgSlug(props.organizationName),
		});

		// [TODO] Create organization membership
	}
);
