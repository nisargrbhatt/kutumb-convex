import type * as schema from "@/db/schema";

type PrimaryKey<T extends string> = string & { __brand: T };

const isPrimaryKey = <T extends keyof typeof schema>(key: string): key is PrimaryKey<T> =>
	key.includes("_");

export const generatePrimaryKey = <T extends keyof typeof schema>(collection: T): PrimaryKey<T> => {
	const id = crypto.randomUUID().replaceAll("-", "");
	const primaryKey = [collection, id].join("_");

	if (!isPrimaryKey<T>(primaryKey)) {
		throw new Error(`Primary key for ${collection} is not a valid primary key`);
	}
	return primaryKey;
};
