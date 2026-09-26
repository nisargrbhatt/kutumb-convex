import { useFormContext } from "react-hook-form";
import { COMMUNITY_PROFILE_BLOOD_GROUP, GENDERS } from "@/db/constants";
import type { CommunityProfileFormValues } from "@/domain/communityProfile";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";

type TextField = "firstName" | "middleName" | "lastName" | "nickName" | "email" | "mobileNumber";

const NAME_FIELDS: { name: TextField; label: string }[] = [
	{ name: "firstName", label: "First Name" },
	{ name: "middleName", label: "Middle Name" },
	{ name: "lastName", label: "Last Name" },
	{ name: "nickName", label: "Nick Name" },
];

const CONTACT_FIELDS: { name: TextField; label: string; type: string }[] = [
	{ name: "email", label: "Email", type: "email" },
	{ name: "mobileNumber", label: "Mobile Number", type: "tel" },
];

function TextInputField({ name, label, type }: { name: TextField; label: string; type?: string }) {
	const form = useFormContext<CommunityProfileFormValues>();
	return (
		<FormField
			control={form.control}
			name={name}
			render={({ field }) => (
				<FormItem>
					<FormLabel>{label}</FormLabel>
					<FormControl>
						<Input type={type} placeholder={label} {...field} value={field.value ?? ""} />
					</FormControl>
					<FormMessage />
				</FormItem>
			)}
		/>
	);
}

function Section({
	id,
	title,
	children,
}: {
	id: string;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="space-y-4" aria-labelledby={id}>
			<h3 id={id} className="text-sm font-medium text-muted-foreground">
				{title}
			</h3>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
		</section>
	);
}

/** Core Community Profile inputs; must render inside a react-hook-form `Form` provider. */
export function ProfileFieldsSection({ showDateOfDeath = false }: { showDateOfDeath?: boolean }) {
	const form = useFormContext<CommunityProfileFormValues>();

	return (
		<div className="space-y-6">
			<Section id="profile-name-heading" title="Name">
				{NAME_FIELDS.map((f) => (
					<TextInputField key={f.name} {...f} />
				))}
			</Section>

			<Section id="profile-personal-heading" title="Personal">
				<FormField
					control={form.control}
					name="gender"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Gender</FormLabel>
							<Select onValueChange={field.onChange} value={field.value ?? null}>
								<FormControl>
									<SelectTrigger aria-label="Gender" className="w-full capitalize">
										<SelectValue placeholder="Select Gender" />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									{Object.values(GENDERS).map((gender) => (
										<SelectItem key={gender} value={gender} className="capitalize">
											{gender}
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
					name="bloodGroup"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Blood Group</FormLabel>
							<Select onValueChange={field.onChange} value={field.value ?? null}>
								<FormControl>
									<SelectTrigger aria-label="Blood Group" className="w-full">
										<SelectValue placeholder="Select Blood Group" />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									{Object.values(COMMUNITY_PROFILE_BLOOD_GROUP).map((bg) => (
										<SelectItem key={bg} value={bg}>
											{bg}
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
					name="dateOfBirth"
					render={({ field }) => (
						<FormItem className="flex flex-col">
							<FormLabel>Date of Birth</FormLabel>
							<DatePicker
								date={field.value}
								setDate={field.onChange}
								placeholder="Pick date of birth"
							/>
							<FormMessage />
						</FormItem>
					)}
				/>
				{showDateOfDeath ? (
					<FormField
						control={form.control}
						name="dateOfDeath"
						render={({ field }) => (
							<FormItem className="flex flex-col">
								<FormLabel>Date of Death</FormLabel>
								<DatePicker
									date={field.value}
									setDate={field.onChange}
									placeholder="Pick date of death"
								/>
								<FormMessage />
							</FormItem>
						)}
					/>
				) : null}
			</Section>

			<Section id="profile-contact-heading" title="Contact">
				{CONTACT_FIELDS.map((f) => (
					<TextInputField key={f.name} {...f} />
				))}
			</Section>
		</div>
	);
}
