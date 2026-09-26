import { useFormContext } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { CUSTOM_FIELD_TYPE } from "@/db/constants";
import type { CustomFieldDefinition } from "@/domain/customFields";

/** One custom field input by type, bound to `customFieldData.<def id>` in the parent form. */
export function CustomFieldInput({ def }: { def: CustomFieldDefinition }) {
	const form = useFormContext();

	return (
		<FormField
			control={form.control}
			name={`customFieldData.${def.id}`}
			render={({ field }) => (
				<FormItem className="flex flex-col justify-end">
					<FormLabel>{def.label}</FormLabel>
					{def.type === CUSTOM_FIELD_TYPE.text && (
						<FormControl>
							<Input placeholder={def.label} {...field} value={field.value ?? ""} />
						</FormControl>
					)}
					{def.type === CUSTOM_FIELD_TYPE.number && (
						<FormControl>
							<Input
								type="number"
								placeholder={def.label}
								{...field}
								value={field.value ?? ""}
								onChange={(e) =>
									field.onChange(e.target.value ? Number(e.target.value) : undefined)
								}
							/>
						</FormControl>
					)}
					{def.type === CUSTOM_FIELD_TYPE.boolean && (
						<Select
							items={{ yes: "Yes", no: "No" }}
							onValueChange={(val) => field.onChange(val === "yes")}
							value={field.value === true ? "yes" : field.value === false ? "no" : undefined}
						>
							<FormControl>
								<SelectTrigger aria-label={def.label}>
									<SelectValue placeholder={`Select ${def.label}`} />
								</SelectTrigger>
							</FormControl>
							<SelectContent>
								<SelectItem value="yes">Yes</SelectItem>
								<SelectItem value="no">No</SelectItem>
							</SelectContent>
						</Select>
					)}
					{def.type === CUSTOM_FIELD_TYPE.date && (
						<DatePicker
							date={field.value ? new Date(field.value) : undefined}
							setDate={(d) => field.onChange(d?.toJSON())}
							placeholder={`Pick ${def.label}`}
						/>
					)}
					<FormMessage />
				</FormItem>
			)}
		/>
	);
}
