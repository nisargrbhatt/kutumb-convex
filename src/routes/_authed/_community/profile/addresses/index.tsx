import { PageHeader } from "@/components/CommunityLayout/PageHeader";
import { myAddressesQuery, useAddMyAddress, useDeleteMyAddress } from "@/queries/communityAddress";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormDrawer } from "@/components/ui/form-drawer";
import {
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { COMMUNITY_ADDRESS_TYPE } from "@/db/constants";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { MapPin, MapPinOff, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

export const Route = createFileRoute("/_authed/_community/profile/addresses/")({
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(myAddressesQuery(context.organizationId));
	},
	component: RouteComponent,
});

const addressFormSchema = z.object({
	line1: z.string().min(1, "Line 1 is required"),
	line2: z.string().optional(),
	country: z.string().min(1, "Country is required"),
	state: z.string().min(1, "State is required"),
	city: z.string().min(1, "City is required"),
	postalCode: z.string().min(1, "Postal code is required"),
	type: z
		.enum([COMMUNITY_ADDRESS_TYPE.home, COMMUNITY_ADDRESS_TYPE.work, COMMUNITY_ADDRESS_TYPE.other])
		.optional(),
	note: z.string().optional(),
	digipin: z.string().optional(),
});

function RouteComponent() {
	const [isAddOpen, setIsAddOpen] = useState(false);

	const { organizationId: orgId } = Route.useRouteContext();
	const { data: addresses } = useSuspenseQuery(myAddressesQuery(orgId));

	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 p-2">
			<PageHeader
				crumbs={[{ label: "Profile", to: "/profile/info" }, { label: "Addresses" }]}
				title="Addresses"
				description="Manage your residential, work, and other addresses."
				actions={<AddressFormDrawer open={isAddOpen} onOpenChange={setIsAddOpen} />}
			/>

			<div className="flex w-full flex-col gap-6">
				<div className="w-full overflow-x-auto rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Type</TableHead>
								<TableHead>Line 1</TableHead>
								<TableHead className="hidden lg:table-cell">Line 2</TableHead>
								<TableHead className="hidden sm:table-cell">City</TableHead>
								<TableHead className="hidden md:table-cell">State</TableHead>
								<TableHead className="hidden lg:table-cell">Country</TableHead>
								<TableHead className="hidden md:table-cell">Postal Code</TableHead>
								<TableHead className="hidden lg:table-cell">Digipin</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{addresses.length === 0 ? (
								<TableRow>
									<TableCell colSpan={9} className="h-32">
										<div className="flex flex-col items-center justify-center gap-2 text-center text-muted-foreground">
											<MapPinOff className="size-8 text-muted-foreground/50" />
											<p>No addresses found.</p>
										</div>
									</TableCell>
								</TableRow>
							) : (
								addresses.map((address) => (
									<TableRow key={address.id}>
										<TableCell>
											<div className="flex flex-col items-start gap-0.5">
												<span className="font-medium capitalize">{address.type ?? "Address"}</span>
												{address.note && (
													<span className="text-xs text-muted-foreground">{address.note}</span>
												)}
											</div>
										</TableCell>
										<TableCell>{address.line1}</TableCell>
										<TableCell className="hidden lg:table-cell">{address.line2 || "-"}</TableCell>
										<TableCell className="hidden sm:table-cell">{address.city}</TableCell>
										<TableCell className="hidden md:table-cell">{address.state}</TableCell>
										<TableCell className="hidden lg:table-cell">{address.country}</TableCell>
										<TableCell className="hidden md:table-cell">{address.postalCode}</TableCell>
										<TableCell className="hidden lg:table-cell">
											{address.digipin ? (
												<a
													className="w-fit link"
													href={`https://dac.indiapost.gov.in/mydigipin/home/${address.digipin}`}
													target="_blank"
												>
													{address.digipin}
												</a>
											) : (
												"-"
											)}
										</TableCell>
										<TableCell className="text-right">
											<DeleteAddressDialog id={address.id} />
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</div>
			</div>
		</div>
	);
}

function DeleteAddressDialog({ id }: { id: string }) {
	const [open, setOpen] = useState(false);

	const deleteAddress = useDeleteMyAddress();

	return (
		<ConfirmDialog
			open={open}
			onOpenChange={setOpen}
			trigger={
				<Button variant="destructive" size="icon-sm" aria-label="Delete address">
					<Trash2 className="size-4" />
				</Button>
			}
			title="Delete address?"
			description="This will permanently delete this address. This action cannot be undone."
			confirmLabel="Delete"
			destructive
			onConfirm={() => deleteAddress.mutate(id, { onSuccess: () => setOpen(false) })}
			isPending={deleteAddress.isPending}
		/>
	);
}

function AddressFormDrawer({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const form = useForm<z.infer<typeof addressFormSchema>>({
		resolver: zodResolver(addressFormSchema),
		defaultValues: {
			line1: "",
			line2: "",
			country: "",
			state: "",
			city: "",
			postalCode: "",
			type: COMMUNITY_ADDRESS_TYPE.home,
			note: "",
			digipin: "",
		},
	});

	const addAddress = useAddMyAddress();

	const onSubmit = (values: z.infer<typeof addressFormSchema>) =>
		addAddress.mutate(values, {
			onSuccess: () => {
				form.reset();
				onOpenChange(false);
			},
		});

	return (
		<FormDrawer
			open={open}
			onOpenChange={onOpenChange}
			trigger={
				<Button size="sm">
					<MapPin className="size-4" />
					Add Address
				</Button>
			}
			title="Add address"
			description="Add your home, work or other address."
			form={form}
			onSubmit={onSubmit}
			submitLabel="Add address"
			isPending={addAddress.isPending}
			size="lg"
		>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				<FormField
					control={form.control}
					name="type"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Type</FormLabel>
							<Select onValueChange={field.onChange} defaultValue={field.value}>
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
