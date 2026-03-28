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

export interface CustomField {
	id: string;
	label: string;
	type: string | "text" | "number" | "date" | "boolean";
}

interface CustomFieldsFormProps {
	customFields: CustomField[];
	parentKeyName?: string;
}

export function CustomFieldsForm({
	customFields,
	parentKeyName = "customFieldData",
}: CustomFieldsFormProps) {
	const form = useFormContext();

	if (!customFields || customFields.length === 0) {
		return null;
	}

	return (
		<div className="space-y-4 pt-4">
			<h3 className="text-lg font-medium">Custom Fields</h3>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				{customFields.map((field) => (
					<FormField
						key={field.id}
						control={form.control}
						name={`${parentKeyName}.${field.label}`}
						render={({ field: formField }) => (
							<FormItem className="flex flex-col justify-end">
								<FormLabel>{field.label}</FormLabel>
								{field.type === CUSTOM_FIELD_TYPE.text && (
									<FormControl>
										<Input placeholder={field.label} {...formField} value={formField.value ?? ""} />
									</FormControl>
								)}
								{field.type === CUSTOM_FIELD_TYPE.number && (
									<FormControl>
										<Input
											type="number"
											placeholder={field.label}
											{...formField}
											value={formField.value ?? ""}
											onChange={(e) =>
												formField.onChange(e.target.value ? Number(e.target.value) : undefined)
											}
										/>
									</FormControl>
								)}
								{field.type === CUSTOM_FIELD_TYPE.boolean && (
									<Select
										onValueChange={(val) => formField.onChange(val === "yes")}
										value={
											formField.value === true
												? "yes"
												: formField.value === false
													? "no"
													: undefined
										}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue placeholder={`Select ${field.label}`} />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectItem value="yes">Yes</SelectItem>
											<SelectItem value="no">No</SelectItem>
										</SelectContent>
									</Select>
								)}
								{field.type === CUSTOM_FIELD_TYPE.date && (
									<DatePicker
										date={formField.value ? new Date(formField.value) : undefined}
										setDate={(d) => formField.onChange(d?.toJSON())}
										placeholder={`Pick ${field.label}`}
									/>
								)}
								<FormMessage />
							</FormItem>
						)}
					/>
				))}
			</div>
		</div>
	);
}
