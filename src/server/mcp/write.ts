import { AppError } from "@/domain/errors";
import { WRITE_DENIED_MESSAGE } from "@/domain/mcpWrite";
import type { ConnectionActor } from "./actor";

/**
 * Shared guard for every write tool: effective write (token ∩ consent ∩ org toggle, ADR 0006)
 * or `WriteNotAllowed` with the reason in `code`. `tools/list` already hides write tools when
 * denied; this covers a call racing a downgrade or the owner turning writes off.
 */
export function requireWrite(actor: ConnectionActor): void {
	if (actor.write.canWrite) return;
	throw new AppError(
		"WriteNotAllowed",
		WRITE_DENIED_MESSAGE[actor.write.reason],
		actor.write.reason
	);
}
