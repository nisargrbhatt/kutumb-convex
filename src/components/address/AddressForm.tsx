import type { ReactElement } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { FormDrawer } from "@/components/ui/form-drawer";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { COMMUNITY_ADDRESS_TYPE } from "@/db/constants";
import { addressFormSchema, toAddressInput, type AddressFormValues } from "@/domain/address";
import type { AddressInput } from "@/domain/profileChanges";

/**
 * Address add/edit drawer. Parent owns the submit adapter; `onSubmit` resolving `true` closes it
 * (and resets an add form). Key it per address when editing so values re-sync.
 */
export function AddressForm({
	open,
	onOpenChange,
	trigger,
	title,
	description,
	submitLabel,
	defaultValues,
	onSubmit,
	isPending,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	trigger?: ReactElement;
	title: string;
	description: string;
	submitLabel: string;
	defaultValues: AddressFormValues;
	onSubmit: (input: AddressInput) => Promise<boolean>;
	isPending?: boolean;
}) {
	const form = useForm<AddressFormValues>({
		resolver: zodResolver(addressFormSchema),
		values: defaultValues,
		resetOptions: { keepDirtyValues: true },
	});

	const handleSubmit = async (values: AddressFormValues) => {
		if (!(await onSubmit(toAddressInput(values)))) return;
		form.reset(defaultValues, { keepDirtyValues: false });
		onOpenChange(false);
	};

	return (
		<FormDrawer
			open={open}
			onOpenChange={onOpenChange}
			trigger={trigger}
			title={title}
			description={description}
			form={form}
			onSubmit={handleSubmit}
			submitLabel={submitLabel}
			isPending={isPending}
			size="lg"
		>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				<FormField
					control={form.control}
					name="type"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Type</FormLabel>
							<Select onValueChange={field.onChange} value={field.value}>
								<FormControl>
									<SelectTrigger>
										<SelectValue placeholder="Select type" />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									{Object.values(COMMUNITY_ADDRESS_TYPE).map((type) => (
										<SelectItem key={type} value={type} className="capitalize">
											{type}
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
					name="line1"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Line1</FormLabel>
							<FormControl>
								<Input placeholder="Line 1" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="line2"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Line2</FormLabel>
							<FormControl>
								<Input placeholder="Line 2" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="country"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Country</FormLabel>
							<FormControl>
								<Input placeholder="Country" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="state"
					render={({ field }) => (
						<FormItem>
							<FormLabel>State</FormLabel>
							<FormControl>
								<Input placeholder="State" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="city"
					render={({ field }) => (
						<FormItem>
							<FormLabel>City</FormLabel>
							<FormControl>
								<Input placeholder="City" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="postalCode"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Postal Code</FormLabel>
							<FormControl>
								<Input placeholder="Postal Code" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="digipin"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Digipin</FormLabel>
							<FormControl>
								<Input placeholder="Digipin" {...field} />
							</FormControl>
							<FormDescription>
								Get your Digipin{" "}
								<a
									href="https://dac.indiapost.gov.in/mydigipin/home"
									target="_blank"
									rel="noreferrer"
									className="underline transition-colors hover:text-primary"
								>
									here
								</a>
							</FormDescription>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="note"
					render={({ field }) => (
						<FormItem className="col-span-1 md:col-span-2">
							<FormLabel>Note</FormLabel>
							<FormControl>
								<Textarea placeholder="Note" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
			</div>
		</FormDrawer>
	);
}
