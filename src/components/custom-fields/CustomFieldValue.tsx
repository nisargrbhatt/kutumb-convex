import { Check, X } from "lucide-react";
import { CUSTOM_FIELD_TYPE } from "@/db/constants";
import { formatCustomFieldValue, type CustomFieldDefinition } from "@/domain/customFields";

/** Read-only rendering of one custom field value; booleans get a check/x icon. */
export function CustomFieldValue({
	def,
	value,
}: {
	def: Pick<CustomFieldDefinition, "type">;
	value: unknown;
}) {
	const text = formatCustomFieldValue(def, value);

	if (def.type === CUSTOM_FIELD_TYPE.boolean && typeof value === "boolean") {
		const Icon = value ? Check : X;
		return (
			<span className="inline-flex items-center gap-1.5">
				<Icon
					aria-hidden
					className={value ? "size-4 text-emerald-600" : "size-4 text-muted-foreground"}
				/>
				{text}
			</span>
		);
	}

	return <>{text}</>;
}
