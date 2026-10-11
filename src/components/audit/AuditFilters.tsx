import { Fragment } from "react";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { AuditAction, AuditCategory } from "@/db/constants";
import { AUDIT_ACTION, AUDIT_CATEGORY, auditActionsInCategory } from "@/db/constants";
import { auditActionLabel } from "@/domain/audit";

const CATEGORY_LABEL: Record<AuditCategory, string> = {
	profile: "Profile",
	relation: "Relation",
	address: "Address",
	request: "Request",
};
const CATEGORIES = Object.values(AUDIT_CATEGORY);

/**
 * Action filter value: `""` (all), `cat:<category>` or an Audit Action. `actionsFor` turns it
 * into the query's `actions` list.
 */
export type ActionFilterValue = "" | `cat:${AuditCategory}` | AuditAction;

export function actionsFor(value: string | undefined): AuditAction[] | undefined {
	if (!value) return undefined;
	if (value.startsWith("cat:")) {
		const cat = value.slice(4) as AuditCategory;
		return CATEGORIES.includes(cat) ? auditActionsInCategory(cat) : undefined;
	}
	return (Object.values(AUDIT_ACTION) as string[]).includes(value)
		? [value as AuditAction]
		: undefined;
}

const labelOf = (v: string) => {
	if (!v) return "All actions";
	if (v.startsWith("cat:")) return `All ${CATEGORY_LABEL[v.slice(4) as AuditCategory]}`;
	return auditActionLabel(v as AuditAction);
};

/** Category only (History tab) or category + individual actions (Audit log). */
export function ActionFilter({
	value,
	onChange,
	withActions = false,
	className,
}: {
	value: string;
	onChange: (value: ActionFilterValue) => void;
	withActions?: boolean;
	className?: string;
}) {
	return (
		<Select
			value={value || "all"}
			onValueChange={(v) => onChange((v && v !== "all" ? v : "") as ActionFilterValue)}
		>
			<SelectTrigger className={className} aria-label="Filter by action">
				<SelectValue>{(v: string | null) => labelOf(v && v !== "all" ? v : "")}</SelectValue>
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="all">All actions</SelectItem>
				{withActions
					? CATEGORIES.map((cat) => (
							<Fragment key={cat}>
								<SelectSeparator />
								<SelectGroup>
									<SelectLabel>{CATEGORY_LABEL[cat]}</SelectLabel>
									<SelectItem value={`cat:${cat}`}>All {CATEGORY_LABEL[cat]}</SelectItem>
									{auditActionsInCategory(cat).map((a) => (
										<SelectItem key={a} value={a}>
											{auditActionLabel(a)}
										</SelectItem>
									))}
								</SelectGroup>
							</Fragment>
						))
					: CATEGORIES.map((cat) => (
							<SelectItem key={cat} value={`cat:${cat}`}>
								All {CATEGORY_LABEL[cat]}
							</SelectItem>
						))}
			</SelectContent>
		</Select>
	);
}
