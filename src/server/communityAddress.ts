import { orgMiddleware } from "@/middleware/org";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";
import { db } from "@/db";
import { addressInput } from "@/domain/address";
import { profileChanges } from "@/lib/profileChanges";

const profileId = z.string().trim().min(1, "Profile is required");
const addressId = z.string().trim().min(1, "Address is required");

export const getMyCommunityAddresses = createServerFn({ method: "GET" })
	.middleware([orgMiddleware])
	.handler(async ({ context }) => {
		const { organizationId, userId } = context.actor;

		const profile = await db.query.communityProfile.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.organizationId, organizationId),
					operators.eq(fields.userId, userId)
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

export const addAddress = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(z.object({ profileId, address: addressInput }))
	.handler(({ context, data }) =>
		profileChanges.submit(context.actor, { kind: "address_add", ...data })
	);

export const editAddress = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(
		z.object({
			profileId,
			addressId,
			expectedVersion: z.number().int().min(0),
			address: addressInput,
		})
	)
	.handler(({ context, data }) =>
		profileChanges.submit(context.actor, { kind: "address_edit", ...data })
	);

export const removeAddress = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(z.object({ profileId, addressId }))
	.handler(({ context, data }) =>
		profileChanges.submit(context.actor, { kind: "address_remove", ...data })
	);
