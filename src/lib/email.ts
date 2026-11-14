import type { ReactElement } from "react";
import { env } from "cloudflare:workers";
import { Resend } from "resend";
import { EMAIL_CONFIG } from "./common";

const resend = new Resend(env.RESEND_API_KEY);

type Email = { to: string; subject: string; react: ReactElement };

/** Resend adapter. Logs failures and never throws; `false` = not sent (callers that retry). */
export async function trySendEmail(o: Email): Promise<boolean> {
	try {
		const { error } = await resend.emails.send({ from: EMAIL_CONFIG.from, ...o });
		if (!error) return true;
		console.error(`Resend rejected email "${o.subject}"`, error);
	} catch (error) {
		console.error(`Failed to send email "${o.subject}"`, error);
	}
	return false;
}

/** Fire-and-forget send — auth flows must not break on mail errors. */
export async function sendEmail(o: Email): Promise<void> {
	await trySendEmail(o);
}
