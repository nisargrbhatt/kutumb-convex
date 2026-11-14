import { can, type Actor } from "./permission";

/**
 * Feed policy (pure, client-safe): server and UI share it, the UI through `useActor`. Compares
 * `actor.userId` with the row's `authorUserId`; no ex-member logic. `can()` looks at role only, so
 * every Feed write loads its row by id + `actor.organizationId` first (another org's row is
 * `NotFound` before this runs). `null` actor (no active membership) gets nothing.
 */
type Authored = { authorUserId: string };

const isAuthor = (actor: Actor | null, row: Authored) => actor?.userId === row.authorUserId;
const moderates = (actor: Actor | null) => actor !== null && can(actor, { post: ["moderate"] });

/** Author only, any role. Owner/admin can't edit someone else's Post. */
export const canEditPost = (actor: Actor | null, p: Authored) => isAuthor(actor, p);

/** Author, or `post: ["moderate"]` (owner/admin, no hierarchy). */
export const canRemovePost = (actor: Actor | null, p: Authored) =>
	isAuthor(actor, p) || moderates(actor);

/** Same rule as a Post. The Post's author gets no extra right over comments on it. */
export const canRemoveComment = (actor: Actor | null, c: Authored) =>
	isAuthor(actor, c) || moderates(actor);

/** What a Post's actions menu shows; no menu when both are false. */
export const postActions = (actor: Actor | null, p: Authored) => ({
	edit: canEditPost(actor, p),
	remove: canRemovePost(actor, p),
});
