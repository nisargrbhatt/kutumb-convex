import { useState } from "react";
import { MapPin, Pencil, Trash2 } from "lucide-react";
import { AddressForm } from "@/components/address/AddressForm";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toAddressFormValues } from "@/domain/address";
import { editCopy } from "@/domain/memberRequests";
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
	suggest = false,
}: {
	profileId: string;
	/** Overrides the mode's drawer description. */
	description?: string;
	/** Plain member on an active Userless Profile: submits a Change Request. */
	suggest?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const add = useAddAddress(profileId);
	const copy = editCopy(suggest).addAddress;
	return (
		<AddressForm
			open={open}
			onOpenChange={setOpen}
			trigger={
				<Button size="sm">
					<MapPin className="size-4" />
					{copy.title}
				</Button>
			}
			title={copy.title}
			description={description ?? copy.description}
			submitLabel={copy.submit}
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
	suggest = false,
}: {
	profileId: string;
	address: AddressInput & { id: string; version: number };
	/** Plain member on an active Userless Profile: edit / delete become Change Requests. */
	suggest?: boolean;
}) {
	const [editOpen, setEditOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const edit = useEditAddress(profileId);
	const remove = useRemoveAddress(profileId);
	const copy = editCopy(suggest);

	return (
		<div className="flex items-center justify-end gap-1">
			<AddressForm
				key={`${address.id}:${address.version}`}
				open={editOpen}
				onOpenChange={setEditOpen}
				trigger={
					<Button variant="outline" size="icon-sm" aria-label={copy.editAddress.title}>
						<Pencil className="size-4" />
					</Button>
				}
				title={copy.editAddress.title}
				description={copy.editAddress.description}
				submitLabel={copy.editAddress.submit}
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
					<Button variant="destructive" size="icon-sm" aria-label={copy.removeAddress.label}>
						<Trash2 className="size-4" />
					</Button>
				}
				title={copy.removeAddress.title}
				description={copy.removeAddress.description}
				confirmLabel={copy.removeAddress.confirm}
				destructive
				onConfirm={() => remove.mutate(address.id, { onSuccess: () => setDeleteOpen(false) })}
				isPending={remove.isPending}
			/>
		</div>
	);
}
