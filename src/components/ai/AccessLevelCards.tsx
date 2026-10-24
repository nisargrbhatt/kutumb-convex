import { Eye, Pencil, type LucideIcon } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

export type AccessLevel = "read" | "write";

type Option = { value: AccessLevel; icon: LucideIcon; title: string; body: string };

/** Read only / Read and make changes: shared by the consent screen and Settings → AI. */
export const ACCESS_OPTIONS: Record<AccessLevel, { icon: LucideIcon; title: string }> = {
	read: { icon: Eye, title: "Read only" },
	write: { icon: Pencil, title: "Read and make changes" },
};

/**
 * Two radio cards. `disabledNote` replaces a card's body when that card can't be picked;
 * `disabled` locks the whole group (e.g. a non-owner on Settings → AI).
 */
export function AccessLevelCards({
	value,
	onChange,
	options,
	disabled,
	disabledNotes,
	className,
	"aria-label": ariaLabel,
}: {
	value: AccessLevel;
	onChange: (value: AccessLevel) => void;
	options: Pick<Option, "value" | "body">[];
	disabled?: boolean;
	disabledNotes?: Partial<Record<AccessLevel, string>>;
	className?: string;
	"aria-label": string;
}) {
	return (
		<RadioGroup
			value={value}
			onValueChange={(v) => onChange(v as AccessLevel)}
			disabled={disabled}
			aria-label={ariaLabel}
			className={cn("gap-2", className)}
		>
			{options.map((option) => {
				const { icon: Icon, title } = ACCESS_OPTIONS[option.value];
				const note = disabledNotes?.[option.value];
				const locked = disabled || !!note;
				return (
					<label
						key={option.value}
						className={cn(
							"flex cursor-pointer gap-3 rounded-lg border p-3 text-sm",
							value === option.value && "border-primary ring-1 ring-primary",
							locked && "cursor-not-allowed opacity-50"
						)}
					>
						<RadioGroupItem value={option.value} disabled={locked} className="mt-0.5" />
						<span className="flex min-w-0 flex-col gap-1">
							<span className="flex items-center gap-1.5 font-medium">
								<Icon className="size-4" aria-hidden /> {title}
							</span>
							<span className="text-xs text-muted-foreground">{note ?? option.body}</span>
						</span>
					</label>
				);
			})}
		</RadioGroup>
	);
}
