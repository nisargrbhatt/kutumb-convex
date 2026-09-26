import type { ReactElement } from "react";
import { env } from "cloudflare:workers";
import { Resend } from "resend";
import { EMAIL_CONFIG } from "./common";

const resend = new Resend(env.RESEND_API_KEY);

/** Resend adapter. Logs failures and never throws — auth flows must not break on mail errors. */
export async function sendEmail(o: {
	to: string;
	subject: string;
	react: ReactElement;
}): Promise<void> {
	try {
		const { error } = await resend.emails.send({ from: EMAIL_CONFIG.from, ...o });
		if (error) console.error(`Resend rejected email "${o.subject}"`, error);
	} catch (error) {
		console.error(`Failed to send email "${o.subject}"`, error);
	}
}
