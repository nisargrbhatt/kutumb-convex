import { useState } from "react";
import { MapPin, Pencil, Trash2 } from "lucide-react";
import { AddressForm } from "@/components/address/AddressForm";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toAddressFormValues } from "@/domain/address";
import type { AddressInput } from "@/domain/profileChanges";
import { useAddAddress, useEditAddress, useRemoveAddress } from "@/queries/communityAddress";

const succeeded = (p: Promise<unknown>) =>
	p.then(
		() => true,
		() => false
	);

/** "Add address" drawer + trigger for `profileId`. */
export function AddAddressButton({
	profileId,
	description,
}: {
	profileId: string;
	description: string;
}) {
	const [open, setOpen] = useState(false);
	const add = useAddAddress(profileId);
	return (
		<AddressForm
			open={open}
			onOpenChange={setOpen}
			trigger={
				<Button size="sm">
					<MapPin className="size-4" />
					Add address
				</Button>
			}
			title="Add address"
			description={description}
			submitLabel="Add address"
			defaultValues={toAddressFormValues()}
			onSubmit={(address) => succeeded(add.mutateAsync(address))}
			isPending={add.isPending}
		/>
	);
}

/** Edit + delete controls for one address of `profileId`. */
export function AddressActions({
	profileId,
	address,
}: {
	profileId: string;
	address: AddressInput & { id: string; version: number };
}) {
	const [editOpen, setEditOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const edit = useEditAddress(profileId);
	const remove = useRemoveAddress(profileId);

	return (
		<div className="flex items-center justify-end gap-1">
			<AddressForm
				key={`${address.id}:${address.version}`}
				open={editOpen}
				onOpenChange={setEditOpen}
				trigger={
					<Button variant="outline" size="icon-sm" aria-label="Edit address">
						<Pencil className="size-4" />
					</Button>
				}
				title="Edit address"
				description="Update this address."
				submitLabel="Save address"
				defaultValues={toAddressFormValues(address)}
				onSubmit={(next) =>
					succeeded(
						edit.mutateAsync({
							addressId: address.id,
							expectedVersion: address.version,
							address: next,
						})
					)
				}
				isPending={edit.isPending}
			/>
			<ConfirmDialog
				open={deleteOpen}
				onOpenChange={setDeleteOpen}
				trigger={
					<Button variant="destructive" size="icon-sm" aria-label="Delete address">
						<Trash2 className="size-4" />
					</Button>
				}
				title="Delete address?"
				description="This will permanently delete this address. This action cannot be undone."
				confirmLabel="Delete"
				destructive
				onConfirm={() => remove.mutate(address.id, { onSuccess: () => setDeleteOpen(false) })}
				isPending={remove.isPending}
			/>
		</div>
	);
}
