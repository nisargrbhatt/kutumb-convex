import { AppError } from "@/domain/errors";
import { READ_ONLY, WRITE_DENIED_MESSAGE, type WriteAccess } from "@/domain/mcpWrite";
import type { ConnectionActor } from "./actor";

/** `WriteNotAllowed` carrying the reason in `code`; an allowed `write` reads as read only. */
export const writeDenied = (write: WriteAccess) => {
	const { reason } = write.canWrite ? READ_ONLY : write;
	return new AppError("WriteNotAllowed", WRITE_DENIED_MESSAGE[reason], reason);
};

/**
 * Shared guard for every write tool: effective write (token ∩ consent ∩ org toggle, ADR 0006)
 * or `WriteNotAllowed` with the reason in `code`. `tools/list` already hides write tools when
 * denied; this covers a call racing a downgrade or the owner turning writes off.
 */
export function requireWrite(actor: ConnectionActor): void {
	if (!actor.write.canWrite) throw writeDenied(actor.write);
}
