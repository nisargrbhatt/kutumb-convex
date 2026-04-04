import {
	addMyCommunityAddress,
	deleteMyCommunityAddress,
	getMyCommunityAddressesQuery,
} from "@/api/communityAddress";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemHeader,
	ItemTitle,
} from "@/components/ui/item";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import { COMMUNITY_ADDRESS_TYPE } from "@/db/constants";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { MapPin, MapPinOff, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/_authed/_community/profile/addresses")({
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(getMyCommunityAddressesQuery());
	},
	component: RouteComponent,
});

function PageHeader() {
	return (
		<div className="flex flex-row items-center justify-start gap-2">
			<SidebarTrigger />
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink asChild>
							<Route.Link to={"/dashboard"}>Home</Route.Link>
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbLink asChild>
							<Route.Link to={"/profile/info"}>Profile</Route.Link>
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>Addresses</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
		</div>
	);
}

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

	const { data: addresses } = useSuspenseQuery(getMyCommunityAddressesQuery());

	const { mutate: deleteAddress, isPending: isDeleting } = useMutation({
		mutationFn: deleteMyCommunityAddress,
		onSuccess: (_d, _v, _r, context) => {
			toast.success("Address deleted successfully");
			context.client.invalidateQueries({
				queryKey: getMyCommunityAddressesQuery().queryKey,
			});
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	return (
		<div className="flex h-full w-full flex-col items-start justify-start gap-4 p-2">
			<PageHeader />

			<div className="flex w-full flex-col gap-6 pt-4">
				<div className="flex items-center justify-between">
					<div>
						<h2 className="text-lg font-medium">Addresses</h2>
						<p className="text-sm text-muted-foreground">
							Manage your residential, work, and other addresses.
						</p>
					</div>
					<AddressFormModal open={isAddOpen} onOpenChange={setIsAddOpen} />
				</div>

				<div className="grid gap-4 md:grid-cols-2">
					{addresses.length === 0 ? (
						<div className="col-span-full flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center text-muted-foreground">
							<MapPinOff className="size-8 text-muted-foreground/50" />
							<p>No addresses found.</p>
						</div>
					) : (
						addresses.map((address) => (
							<Item variant={"outline"} key={address.id} className="items-start shadow-xs">
								<ItemContent>
									<ItemHeader>
										<ItemTitle>
											<div className="flex flex-col items-start gap-1">
												<span className="capitalize">{address.type ?? "Address"}</span>
												{address.note && (
													<span className="text-xs font-normal text-muted-foreground">
														{address.note}
													</span>
												)}
											</div>
										</ItemTitle>
										<ItemActions>
											<Button
												variant="destructive"
												size="icon-sm"
												disabled={isDeleting}
												onClick={() => {
													deleteAddress({ data: { id: address.id } });
												}}
											>
												<Trash2 className="size-4" />
												<span className="sr-only">Delete address</span>
											</Button>
										</ItemActions>
									</ItemHeader>
									<ItemDescription className="mt-2 text-foreground">
										<div className="grid grid-cols-[100px_1fr] gap-2 border-b border-border py-2 text-sm last:border-0">
											<span className="font-medium text-muted-foreground">Line 1</span>
											<span>{address.line1}</span>
										</div>
										<div className="grid grid-cols-[100px_1fr] gap-2 border-b border-border py-2 text-sm last:border-0">
											<span className="font-medium text-muted-foreground">Line 2</span>
											<span>{address.line2 || "-"}</span>
										</div>
										<div className="grid grid-cols-[100px_1fr] gap-2 border-b border-border py-2 text-sm last:border-0">
											<span className="font-medium text-muted-foreground">Country</span>
											<span>{address.country}</span>
										</div>
										<div className="grid grid-cols-[100px_1fr] gap-2 border-b border-border py-2 text-sm last:border-0">
											<span className="font-medium text-muted-foreground">State</span>
											<span>{address.state}</span>
										</div>
										<div className="grid grid-cols-[100px_1fr] gap-2 border-b border-border py-2 text-sm last:border-0">
											<span className="font-medium text-muted-foreground">City</span>
											<span>{address.city}</span>
										</div>
										<div className="grid grid-cols-[100px_1fr] gap-2 border-b border-border py-2 text-sm last:border-0">
											<span className="font-medium text-muted-foreground">Postal Code</span>
											<span>{address.postalCode}</span>
										</div>
										<div className="grid grid-cols-[100px_1fr] gap-2 border-b border-border py-2 text-sm last:border-0">
											<span className="font-medium text-muted-foreground">Digipin</span>

											{address.digipin ? (
												<a
													className="w-fit link"
													href={`https://dac.indiapost.gov.in/mydigipin/home/${address.digipin}`}
													target="_blank"
												>
													{address.digipin}
												</a>
											) : (
												<span>-</span>
											)}
										</div>
									</ItemDescription>
								</ItemContent>
							</Item>
						))
					)}
				</div>
			</div>
		</div>
	);
}

function AddressFormModal({
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

	const { mutate: addAddress, isPending } = useMutation({
		mutationFn: addMyCommunityAddress,
		onSuccess: (_d, _v, _r, context) => {
			toast.success("Address added successfully");
			form.reset();
			onOpenChange(false);
			context.client.invalidateQueries({
				queryKey: getMyCommunityAddressesQuery().queryKey,
			});
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	function onSubmit(values: z.infer<typeof addressFormSchema>) {
		addAddress({
			data: values,
		});
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogTrigger asChild>
				<Button size="sm">
					<MapPin className="size-4" />
					Add Address
				</Button>
			</DialogTrigger>
			<DialogContent className="h-[90vh] max-w-2xl overflow-y-auto sm:max-w-[700px] md:h-auto">
				<div className="flex flex-col space-y-1.5 p-6 pb-2">
					<h2 className="text-2xl leading-none font-semibold tracking-tight">Address form</h2>
					<p className="text-sm text-muted-foreground">Add your home, work or other address</p>
				</div>
				<div className="p-6 pt-0">
					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

							<div className="flex justify-end gap-2 pt-4">
								<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
									Cancel
								</Button>
								<Button type="submit" disabled={isPending}>
									{isPending ? "Adding..." : "Add address"}
								</Button>
							</div>
						</form>
					</Form>
				</div>
			</DialogContent>
		</Dialog>
	);
}
