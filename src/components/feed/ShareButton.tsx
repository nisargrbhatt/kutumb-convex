import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { postShareUrl, shareMethod } from "@/domain/shareLink";

/** Share a Post: native sheet on touch, else copy the link with a toast. No title in the share. */
export function ShareButton({ postId }: { postId: string }) {
	const share = async () => {
		const url = postShareUrl(window.location.origin, postId);
		const method = shareMethod({
			hasNativeShare: typeof navigator.share === "function",
			coarsePointer: window.matchMedia("(pointer: coarse)").matches,
		});
		if (method === "native") {
			try {
				await navigator.share({ url });
			} catch (e) {
				// Dismissing the sheet is not an error.
				if ((e as { name?: string })?.name !== "AbortError") toast.error("Couldn't share");
			}
			return;
		}
		try {
			await navigator.clipboard.writeText(url);
			toast.success("Link copied");
		} catch {
			toast.error("Couldn't copy the link");
		}
	};

	return (
		<Button type="button" variant="ghost" size="sm" onClick={share} aria-label="Share post">
			<Share2 className="size-4" />
			<span>Share</span>
		</Button>
	);
}
