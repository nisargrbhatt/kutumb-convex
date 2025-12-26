import { db } from "@/db";
import { getUserProfileCacheKey } from "@/lib/cache";
import { safeAsync } from "@/lib/safe";
import { createServerOnlyFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

/**
 * Creates/Revalidate a cache for the user profile and organizations
 */
export const createUserContextCache = createServerOnlyFn(async (userId: string) => {
	const profile = await db.query.profile.findFirst({
		where: (fields, ops) => ops.eq(fields.userId, userId),
		columns: {
			id: true,
			email: true,
		},
	});

	if (!profile?.id) {
		return null;
	}

	const organizationMember = await db.query.organizationMember.findMany({
		where: (fields, operators) => operators.eq(fields.memberId, profile.id),
		columns: {
			role: true,
			organizationId: true,
		},
	});

	if (!organizationMember || organizationMember.length < 1) {
		await safeAsync(
			env.KV.put(
				getUserProfileCacheKey(userId),
				JSON.stringify({
					profile: profile,
				})
			)
		);
		return {
			profile: profile,
			organization: null,
		};
	}

	const organizations = await db.query.organization.findMany({
		where: (fields, operators) =>
			operators.inArray(
				fields.id,
				organizationMember.map((i) => i.organizationId)
			),
		columns: {
			id: true,
			name: true,
			slug: true,
			customerId: true,
			subscriptionId: true,
		},
	});

	if (!organizations || organizations.length < 1) {
		await safeAsync(
			env.KV.put(
				getUserProfileCacheKey(userId),
				JSON.stringify({
					profile: profile,
				})
			)
		);
		return {
			profile: profile,
			organization: null,
		};
	}

	const mappedOrganizations = organizations.map((org) => {
		const membership = organizationMember.find((m) => m.organizationId === org.id)!;

		return {
			...org,
			membership,
		};
	});

	await safeAsync(
		env.KV.put(
			getUserProfileCacheKey(userId),
			JSON.stringify({
				profile: profile,
				organization: mappedOrganizations,
			})
		)
	);
	return {
		profile: profile,
		organization: mappedOrganizations,
	};
});

export const getFullUserContextCached = createServerOnlyFn(async (userId: string) => {
	const cachedContextResult = await safeAsync(
		env.KV.get<NonNullable<Awaited<ReturnType<typeof createUserContextCache>>>>(
			getUserProfileCacheKey(userId),
			"json"
		)
	);

	if (cachedContextResult.success) {
		return cachedContextResult.data;
	}

	const freshContext = await createUserContextCache(userId);

	return freshContext;
});

export const getUserProfileContext = createServerOnlyFn(async (userId: string) => {
	const profile = await db.query.profile.findFirst({
		where: (fields, ops) => ops.eq(fields.userId, userId),
		columns: {
			id: true,
		},
	});

	if (!profile?.id) {
		throw new Error("Profile not found");
	}

	return { profileId: profile.id };
});

export const getUserOrganizationContext = createServerOnlyFn(async (userId: string) => {
	const { profileId } = await getUserProfileContext(userId);

	const organizationMember = await db.query.organizationMember.findMany({
		where: (fields, operators) => operators.eq(fields.memberId, profileId),
		columns: {
			role: true,
			organizationId: true,
		},
	});

	if (!organizationMember || organizationMember.length < 1) {
		throw new Error("Not part of any organization");
	}

	const organizations = await db.query.organization.findMany({
		where: (fields, operators) =>
			operators.inArray(
				fields.id,
				organizationMember.map((i) => i.organizationId)
			),
		columns: {
			id: true,
			name: true,
			slug: true,
		},
	});

	if (!organizations || organizations.length < 1) {
		throw new Error("Not part of any organization");
	}

	const mappedOrganizations = organizations.map((org) => {
		const membership = organizationMember.find((m) => m.organizationId === org.id)!;

		return {
			...org,
			membership,
		};
	});

	return {
		profileId,
		organizations: mappedOrganizations,
	};
});
