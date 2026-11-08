import type { ReactNode } from "react";
import type { Block, DescriptionDoc, Inline } from "@/domain/memoryDescription";
import { cn } from "@/lib/utils";

/**
 * Shared content class for Preview and detail: Preflight strips heading sizes and list markers, and
 * there's no `@tailwindcss/typography`.
 */
export const descriptionContentClass =
	"flex flex-col gap-3 text-base leading-relaxed break-words [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mt-1 [&_li>div]:flex [&_li>div]:flex-col [&_li>div]:gap-1";

function inline(nodes: Inline[]): ReactNode[] {
	return nodes.map((n, i) => {
		switch (n.t) {
			case "text":
				return n.v;
			case "br":
				return <br key={i} />;
			case "strong":
				return <strong key={i}>{inline(n.c)}</strong>;
			case "em":
				return <em key={i}>{inline(n.c)}</em>;
			case "link":
				return (
					<a key={i} href={n.href} target="_blank" rel="noopener noreferrer">
						{inline(n.c)}
					</a>
				);
		}
	});
}

function block(b: Block, key: number): ReactNode {
	switch (b.t) {
		case "p":
			return <p key={key}>{inline(b.c)}</p>;
		case "h2":
			return <h2 key={key}>{inline(b.c)}</h2>;
		case "h3":
			return <h3 key={key}>{inline(b.c)}</h3>;
		case "ul":
			return (
				<ul key={key}>
					{b.items.map((item, i) => (
						<li key={i}>
							<div>{item.map(block)}</div>
						</li>
					))}
				</ul>
			);
		case "ol":
			return (
				<ol key={key} start={b.start}>
					{b.items.map((item, i) => (
						<li key={i}>
							<div>{item.map(block)}</div>
						</li>
					))}
				</ol>
			);
	}
}

/** Stored description tree → React. No parser, no `dangerouslySetInnerHTML` (ADR 0012). */
export function DescriptionView({ doc, className }: { doc: DescriptionDoc; className?: string }) {
	return <div className={cn(descriptionContentClass, className)}>{doc.map(block)}</div>;
}
