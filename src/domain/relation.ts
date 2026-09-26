import { z } from "zod";
import { COMMUNITY_RELATION_TYPE } from "@/db/constants";

export const relationTypeSchema = z.enum(COMMUNITY_RELATION_TYPE);
export type RelationType = z.infer<typeof relationTypeSchema>;

export const RELATION_TYPES = Object.values(COMMUNITY_RELATION_TYPE);

/** `brother_in_law` → `Brother In Law`; empty → `-`. */
export const formatRelationType = (type: string | null | undefined) =>
	type
		? type
				.split("_")
				.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
				.join(" ")
		: "-";
