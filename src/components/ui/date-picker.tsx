"use client";

import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, X as XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DatePickerProps extends React.ComponentProps<"div"> {
	date?: Date;
	setDate: (date?: Date) => void;
	placeholder?: string;
}

export function DatePicker({
	date,
	setDate,
	className,
	placeholder = "Pick a date",
	...props
}: DatePickerProps) {
	return (
		<div className={cn("grid gap-2", className)} {...props}>
			<Popover>
				<div className="relative">
					<PopoverTrigger asChild>
						<Button
							variant={"outline"}
							className={cn(
								"w-full justify-start text-left font-normal",
								date && "pr-10",
								!date && "text-muted-foreground"
							)}
						>
							<CalendarIcon className="mr-2 size-4" />
							<span className="truncate">{date ? format(date, "PPP") : placeholder}</span>
						</Button>
					</PopoverTrigger>
					{date && (
						<Button
							type="button"
							variant="ghost"
							size="icon"
							aria-label="Clear date"
							className="absolute top-0 right-0 h-full w-9 text-muted-foreground hover:bg-transparent hover:text-foreground"
							onClick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								setDate(undefined);
							}}
						>
							<XIcon className="size-4" />
						</Button>
					)}
				</div>
				<PopoverContent className="w-auto p-0" align="start">
					<Calendar mode="single" selected={date} onSelect={setDate} captionLayout="dropdown" />
				</PopoverContent>
			</Popover>
		</div>
	);
}
