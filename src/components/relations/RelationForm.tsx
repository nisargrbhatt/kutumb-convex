import type { ReactElement } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
} from "@/components/ui/combobox";
import { Checkbox } from "@/components/ui/checkbox";
import {
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { FormDrawer } from "@/components/ui/form-drawer";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { COMMUNITY_RELATION_TYPE } from "@/db/constants";
import { fullName } from "@/domain/communityProfile";
import { formatRelationType, RELATION_TYPES, relationTypeSchema } from "@/domain/relation";
import { activeProfilesForRelationQuery } from "@/queries/communityProfile";
import { useOrgId } from "@/queries/mutation";
import type { RelationFormValues } from "@/queries/communityRelation";

const relationFormSchema = z.object({
	toId: z.string().trim().min(1, "Relative is required"),
	type: relationTypeSchema,
	bloodRelation: z.boolean().default(false).optional(),
	note: z.string().optional(),
});

const RELATION_TYPE_ITEMS = Object.fromEntries(
	RELATION_TYPES.map((t) => [t, formatRelationType(t)])
);

/**
 * Add-relation drawer for `subjectId`. Picker lists active profiles except the subject and
 * `excludeIds` (existing counterparts — one relation per pair). `onSubmit` resolving closes it.
 */
export function RelationForm({
	subjectId,
	excludeIds = [],
	open,
	onOpenChange,
	trigger,
	description,
	onSubmit,
	isPending,
}: {
	subjectId: string;
	excludeIds?: ReadonlyArray<string | null>;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	trigger?: ReactElement;
	description?: string;
	onSubmit: (values: RelationFormValues) => Promise<unknown>;
	isPending: boolean;
}) {
	const orgId = useOrgId();
	const { data = [], isLoading } = useQuery({
		...activeProfilesForRelationQuery(orgId, subjectId),
		enabled: open,
	});
	const profiles = data.filter((p) => !excludeIds.includes(p.id));

	const form = useForm({
		resolver: zodResolver(relationFormSchema),
		defaultValues: {
			toId: "",
			type: COMMUNITY_RELATION_TYPE.brother,
			bloodRelation: false,
			note: "",
		},
	});

	const handleSubmit = async (values: RelationFormValues) => {
		// Errors are toasted by the caller's mutation; keep the drawer open on failure.
		await onSubmit(values).then(
			() => {
				form.reset(undefined, { keepDirtyValues: false });
				onOpenChange(false);
			},
			() => {}
		);
	};

	const selectedId = form.watch("toId");

	return (
		<FormDrawer
			open={open}
			onOpenChange={onOpenChange}
			trigger={trigger}
			title="Add relation"
			description={description}
			form={form}
			onSubmit={handleSubmit}
			submitLabel="Add relation"
			isPending={isPending}
		>
			<FormField
				control={form.control}
				name="toId"
				render={({ field }) => (
					<FormItem>
						<FormLabel>Relative</FormLabel>
						<FormControl>
							<Combobox
								items={profiles}
								itemToStringLabel={(p: (typeof profiles)[number]) => (p ? fullName(p) : "")}
								onValueChange={(next) => field.onChange(next?.id ?? "")}
								name={field.name}
								value={profiles.find((p) => p.id === selectedId) ?? null}
							>
								<ComboboxInput placeholder={isLoading ? "Loading..." : "Select a person"} />
								<ComboboxContent>
									<ComboboxEmpty>No active profiles found.</ComboboxEmpty>
									<ComboboxList>
										{(item: (typeof profiles)[number]) => (
											<ComboboxItem key={item.id} value={item}>
												<Item size="xs" className="p-0">
													<ItemContent>
														<ItemTitle className="whitespace-nowrap">{fullName(item)}</ItemTitle>
														{item.nickName ? (
															<ItemDescription>{item.nickName}</ItemDescription>
														) : null}
													</ItemContent>
												</Item>
											</ComboboxItem>
										)}
									</ComboboxList>
								</ComboboxContent>
							</Combobox>
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>
			<FormField
				control={form.control}
				name="type"
				render={({ field }) => (
					<FormItem>
						<FormLabel>Relation Type</FormLabel>
						<Select items={RELATION_TYPE_ITEMS} onValueChange={field.onChange} value={field.value}>
							<FormControl>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Select relation type" />
								</SelectTrigger>
							</FormControl>
							<SelectContent>
								{RELATION_TYPES.map((type) => (
									<SelectItem key={type} value={type}>
										{formatRelationType(type)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<FormMessage />
					</FormItem>
				)}
			/>
			<FormField
				control={form.control}
				name="bloodRelation"
				render={({ field }) => (
					<FormItem className="flex flex-row items-start space-y-0 space-x-3 rounded-md border p-4">
						<FormControl>
							<Checkbox checked={field.value} onCheckedChange={field.onChange} />
						</FormControl>
						<div className="space-y-1 leading-none">
							<FormLabel>Blood Relation</FormLabel>
							<FormDescription>Is this relation by blood?</FormDescription>
						</div>
					</FormItem>
				)}
			/>
			<FormField
				control={form.control}
				name="note"
				render={({ field }) => (
					<FormItem>
						<FormLabel>Note</FormLabel>
						<FormControl>
							<Textarea placeholder="Optional note" {...field} />
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>
		</FormDrawer>
	);
}
