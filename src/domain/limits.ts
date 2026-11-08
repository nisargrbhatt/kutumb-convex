import { pendingCutoff } from "./blob";
import { AppError } from "./errors";

export const ORG_LIMIT = 5;
export const MEMBER_LIMIT = 1000;
export const PROFILE_LIMIT = MEMBER_LIMIT;
/** Pending Change Requests per submitter per org. */
export const PENDING_REQUEST_LIMIT = 50;
export const CUSTOM_FIELD_LIMIT = 50;

/** Burst: write-tool calls per minute per Connection. Mirrors the CF RL binding in wrangler.jsonc. */
export const WRITE_BURST_LIMIT = 10;
/** Applied + requested changes per rolling 24h per Connection, all kinds pooled. */
export const WRITE_DAILY_LIMIT = 200;
/** `create_profile` sub-cap inside the daily pool. */
export const CREATE_DAILY_LIMIT = 50;

/** Image variant body cap, checked by the Worker on every `PUT`. */
export const IMAGE_VARIANT_MAX_BYTES = 5 * 1024 * 1024;
/** Photo picked in the browser, before resize. */
export const PICKED_PHOTO_MAX_BYTES = 50 * 1024 * 1024;
/** Picked photo types; no GIF, no SVG. */
export const PICKED_PHOTO_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/heic",
	"image/heif",
];
/** Reserved bytes in unexpired `pending` Blobs per Org Member. */
export const PENDING_UPLOAD_BYTES_LIMIT = 500_000_000;

/** Memory title, required (unconfirmed default). */
export const MEMORY_TITLE_MAX = 120;
/** Memory description, on the Markdown source. */
export const MEMORY_DESCRIPTION_MAX = 5000;
/** Stripped description shown on Feed cards. */
export const MEMORY_DESCRIPTION_TEXT_MAX = 300;
/** List nesting allowed in a Memory description. */
export const MEMORY_LIST_DEPTH_MAX = 3;
/** Media per Memory gallery. */
export const GALLERY_MAX = 5;
/** Comment body, trimmed, not empty. */
export const COMMENT_MAX = 1000;

export const canJoinOrganization = (membershipCount: number) => membershipCount < ORG_LIMIT;
export const canInviteMember = (membersPlusPending: number) => membersPlusPending < MEMBER_LIMIT;
export const canCreateProfile = (profileCount: number) => profileCount < PROFILE_LIMIT;
export const canReservePendingUpload = (pendingBytes: number, declared: number) =>
	pendingBytes + declared <= PENDING_UPLOAD_BYTES_LIMIT;

export const LIMIT_ERROR_CODES = {
	org: "YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS",
	member: "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED",
	profile: "COMMUNITY_PROFILE_LIMIT_REACHED",
	pendingRequest: "PENDING_REQUEST_LIMIT_REACHED",
	customField: "CUSTOM_FIELD_LIMIT_REACHED",
	pendingUpload: "PENDING_UPLOAD_LIMIT_REACHED",
} as const;

export const LIMIT_COPY = {
	orgCreate: {
		title: `You're already in ${ORG_LIMIT} organizations`,
		description: `Leave or delete one to create a new organization. Limit is ${ORG_LIMIT} per account.`,
	},
	orgAccept: {
		title: `Can't accept — you're already in ${ORG_LIMIT} organizations`,
		description: `Leave or delete one, then accept this invite. Limit is ${ORG_LIMIT} per account.`,
	},
	memberInvite: {
		title: "Member limit reached",
		description: `This organization has ${MEMBER_LIMIT} members or pending invites. Remove a member or revoke an invite to send a new one.`,
	},
	profileAdmin: {
		title: "Profile limit reached",
		description: `This organization already has ${MEMBER_LIMIT} community profiles. Delete a profile to add another.`,
	},
	profileSelf: {
		title: "Profile limit reached",
		description: `This organization already has ${MEMBER_LIMIT} community profiles, so your profile can't be created yet. Ask an admin to free a slot.`,
	},
	pendingRequest: {
		title: "Too many pending requests",
		description: `You already have ${PENDING_REQUEST_LIMIT} requests waiting for review. Withdraw one or wait for a review before sending another.`,
	},
	customField: {
		title: "Field limit reached",
		description: `This organization already has ${CUSTOM_FIELD_LIMIT} custom fields. Delete one to add another.`,
	},
	pendingUpload: {
		title: "Too many unsaved uploads",
		description: `You have ${PENDING_UPLOAD_BYTES_LIMIT / 1_000_000} MB of uploads that aren't saved yet. Save or cancel them, or wait a day, then try again.`,
	},
} as const;

export type LimitKind = keyof typeof LIMIT_ERROR_CODES;

export class LimitError extends AppError {
	constructor(public limit: LimitKind) {
		super("LimitReached", undefined, LIMIT_ERROR_CODES[limit]);
	}
}

export type Counters = {
	userMemberships(userId: string): Promise<number>;
	orgMembersAndPending(organizationId: string): Promise<number>;
	orgProfiles(organizationId: string): Promise<number>;
	/** Sum of `size` over the member's `pending` Blobs created at or after `since`. */
	memberPendingBytes(organizationId: string, userId: string, since: Date): Promise<number>;
};

export type OnLimitReached = (e: {
	limit: LimitKind;
	organizationId?: string;
	userId?: string;
}) => void;

export const makeLimits = (counters: Counters, onReached: OnLimitReached) => ({
	async assertOrgSlot(userId: string) {
		const n = await counters.userMemberships(userId);
		if (!canJoinOrganization(n)) {
			onReached({ limit: "org", userId });
			throw new LimitError("org");
		}
	},
	async assertMemberSlot(organizationId: string) {
		const n = await counters.orgMembersAndPending(organizationId);
		if (!canInviteMember(n)) {
			onReached({ limit: "member", organizationId });
			throw new LimitError("member");
		}
	},
	async assertProfileSlot(organizationId: string, userId: string) {
		const n = await counters.orgProfiles(organizationId);
		if (!canCreateProfile(n)) {
			onReached({ limit: "profile", organizationId, userId });
			throw new LimitError("profile");
		}
	},
	/** Pending cap: unexpired rows only, so a missed sweep can't lock a member out. */
	async assertPendingUploadSlot(
		organizationId: string,
		userId: string,
		declared: number,
		now: Date
	) {
		const n = await counters.memberPendingBytes(organizationId, userId, pendingCutoff(now));
		if (!canReservePendingUpload(n, declared)) {
			onReached({ limit: "pendingUpload", organizationId, userId });
			throw new LimitError("pendingUpload");
		}
	},
});

// Generic code -> copy mapping for consumers with no site-specific message (LIMIT_COPY entries
// with several variants per limit, e.g. orgCreate/orgAccept, still need to pick their own key).
export const limitMessage = (codeOrError: string | AppError | null | undefined) => {
	const code = typeof codeOrError === "string" ? codeOrError : codeOrError?.code;
	switch (code) {
		case LIMIT_ERROR_CODES.org:
			return LIMIT_COPY.orgAccept;
		case LIMIT_ERROR_CODES.member:
			return LIMIT_COPY.memberInvite;
		case LIMIT_ERROR_CODES.profile:
			return LIMIT_COPY.profileAdmin;
		case LIMIT_ERROR_CODES.pendingRequest:
			return LIMIT_COPY.pendingRequest;
		case LIMIT_ERROR_CODES.customField:
			return LIMIT_COPY.customField;
		case LIMIT_ERROR_CODES.pendingUpload:
			return LIMIT_COPY.pendingUpload;
		default:
			return undefined;
	}
};
