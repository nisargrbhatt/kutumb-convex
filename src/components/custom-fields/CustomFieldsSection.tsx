import type { CustomFieldDefinition } from "@/domain/customFields";
import { CustomFieldInput } from "@/components/custom-fields/CustomFieldInput";

/** Grid of custom field inputs; renders nothing when the community has no definitions. */
export function CustomFieldsSection({ defs }: { defs: CustomFieldDefinition[] }) {
	if (defs.length === 0) return null;

	return (
		<section className="space-y-4 border-t pt-4" aria-labelledby="custom-fields-heading">
			<h3 id="custom-fields-heading" className="text-lg font-medium">
				Custom Fields
			</h3>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				{defs.map((def) => (
					<CustomFieldInput key={def.id} def={def} />
				))}
			</div>
		</section>
	);
}
