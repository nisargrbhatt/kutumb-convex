import { db } from "@/db";
import { profile } from "@/db/app-schema";
import { generatePrimaryKey } from "@/lib/generate";
import { safeAsync } from "@/lib/safe";
import { authMiddleware } from "@/middleware/auth";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import * as z from "zod";

export const createProfile = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			displayName: z.string().trim().min(1, "Display name is required"),
			email: z.email().trim().min(1, "Email is required"),
		})
	)
	.handler(async ({ context, data }) => {
		const profileExistsResult = await safeAsync(
			db.query.profile.findFirst({
				where: (fields) => eq(fields.userId, context.userId),
				columns: {
					id: true,
				},
			})
		);

		if (!profileExistsResult.success) {
			console.error(profileExistsResult.error);
			throw profileExistsResult.error;
		}

		if (profileExistsResult.data?.id) {
			throw new Error("Profile already exists");
		}

		const newProfileResult = await safeAsync(
			db.insert(profile).values({
				displayName: data.displayName,
				email: data.email,
				userId: context.userId,
				id: generatePrimaryKey("profile"),
			})
		);

		if (!newProfileResult.success) {
			console.error(newProfileResult.error);
			throw newProfileResult.error;
		}

		return {
			message: "Profile created successfully",
		};
	});
