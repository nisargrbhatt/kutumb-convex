/** Plain `/feed/$postId`: no org in the URL (spec: Feed > Share link). Pure, client-safe. */
export const postShareUrl = (origin: string, postId: string) =>
	`${origin}/feed/${encodeURIComponent(postId)}`;

/** Native share sheet on touch devices, else copy with a toast. */
export const shareMethod = (env: { hasNativeShare: boolean; coarsePointer: boolean }) =>
	env.hasNativeShare && env.coarsePointer ? ("native" as const) : ("copy" as const);
