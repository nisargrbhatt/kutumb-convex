import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { Bold, Heading, Italic, Link2, List, ListOrdered } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { FormDrawer } from "@/components/ui/form-drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { memoryInput } from "@/domain/feed";
import { MEMORY_DESCRIPTION_MAX } from "@/domain/limits";
import { parseDescription } from "@/domain/memoryDescription";
import { memoryEditQuery, useCreateMemory, useUpdateMemory } from "@/queries/feed";
import { useOrgId } from "@/queries/mutation";
import { DescriptionView } from "./DescriptionView";

/**
 * Create / edit Memory Drawer. Loaded lazily (it pulls in `marked` through the description
 * module). Closing it any way discards the form. Text-only for now; the gallery lands with its
 * slice.
 */

const formSchema = z.object({
	title: memoryInput.shape.title,
	description: z.string().superRefine((value, ctx) => {
		const r = parseDescription(value);
		if (!r.ok) ctx.addIssue({ code: "custom", message: r.error });
	}),
});
type FormValues = z.infer<typeof formSchema>;
const EMPTY: FormValues = { title: "", description: "" };

type Edit = (ta: HTMLTextAreaElement) => void;

const wrap =
	(before: string, after: string, placeholder: string): Edit =>
	(ta) => {
		const { selectionStart: s, selectionEnd: e } = ta;
		const text = ta.value.slice(s, e) || placeholder;
		ta.setRangeText(before + text + after, s, e);
		ta.setSelectionRange(s + before.length, s + before.length + text.length);
	};

const prefixLines =
	(prefix: (i: number) => string): Edit =>
	(ta) => {
		const start = ta.value.lastIndexOf("\n", ta.selectionStart - 1) + 1;
		const end = ta.selectionEnd;
		const lines = ta.value.slice(start, end).split("\n");
		ta.setRangeText(lines.map((l, i) => prefix(i) + l).join("\n"), start, end, "end");
	};

const TOOLS: { label: string; icon: typeof Bold; edit: Edit }[] = [
	{ label: "Heading", icon: Heading, edit: prefixLines(() => "# ") },
	{ label: "Bold", icon: Bold, edit: wrap("**", "**", "bold") },
	{ label: "Italic", icon: Italic, edit: wrap("_", "_", "italic") },
	{ label: "Bullet list", icon: List, edit: prefixLines(() => "- ") },
	{ label: "Numbered list", icon: ListOrdered, edit: prefixLines((i) => `${i + 1}. `) },
	{ label: "Link", icon: Link2, edit: wrap("[", "](https://)", "link text") },
];

function Preview({ source }: { source: string }) {
	const parsed = parseDescription(source);
	if (!parsed.ok) return <p className="text-sm text-destructive">{parsed.error}</p>;
	if (!parsed.doc) return <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>;
	return <DescriptionView doc={parsed.doc} />;
}

export default function MemoryDrawer({
	open,
	onOpenChange,
	postId,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Edit this Memory (author only) instead of creating one. */
	postId?: string;
}) {
	const isEdit = postId !== undefined;
	const orgId = useOrgId();
	const create = useCreateMemory();
	const update = useUpdateMemory(postId ?? "");
	const save = isEdit ? update : create;
	const source = useQuery({ ...memoryEditQuery(orgId, postId ?? ""), enabled: isEdit && open });
	const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: EMPTY });
	// Edit loads the source of truth (`description`), never the derived tree.
	const loaded = source.data;
	useEffect(() => {
		if (open && loaded) form.reset(loaded);
	}, [open, loaded, form]);
	const loading = isEdit && !loaded;
	const textarea = useRef<HTMLTextAreaElement | null>(null);
	const description = useWatch({ control: form.control, name: "description" });
	const { ref: registerRef, ...descriptionField } = form.register("description");

	const apply = (edit: Edit) => {
		const ta = textarea.current;
		if (!ta) return;
		ta.focus();
		edit(ta);
		form.setValue("description", ta.value, { shouldDirty: true });
	};

	const onSubmit = async (values: FormValues) => {
		try {
			await save.mutateAsync(values);
		} catch {
			return; // toast shown; text stays
		}
		form.reset(EMPTY);
		onOpenChange(false);
	};

	return (
		<FormDrawer
			open={open}
			onOpenChange={onOpenChange}
			title={isEdit ? "Edit memory" : "Share a memory"}
			description={
				isEdit
					? "Changes show at once, marked as edited."
					: "Posted to your community's Feed at once."
			}
			form={form}
			onSubmit={onSubmit}
			submitLabel={isEdit ? "Save" : "Post"}
			isPending={save.isPending || loading}
			size="lg"
		>
			{source.isError ? (
				<p role="alert" className="text-sm text-destructive">
					{source.error.message || "Couldn't load this memory."}
				</p>
			) : null}
			<FormField
				control={form.control}
				name="title"
				render={({ field }) => (
					<FormItem>
						<FormLabel>Title</FormLabel>
						<FormControl>
							<Input
								placeholder="Diwali at Nani's, 1998"
								className="text-base md:text-base"
								{...field}
							/>
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>
			<div className="grid gap-2">
				<Label htmlFor="memory-description">Description</Label>
				<Tabs defaultValue="write" className="gap-2">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<TabsList>
							<TabsTrigger value="write">Write</TabsTrigger>
							<TabsTrigger value="preview">Preview</TabsTrigger>
						</TabsList>
					</div>
					<TabsContent value="write" className="flex flex-col gap-2">
						<div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-1">
							{TOOLS.map(({ label, icon: Icon, edit }) => (
								<Button
									key={label}
									type="button"
									variant="ghost"
									size="icon-sm"
									aria-label={label}
									title={label}
									onClick={() => apply(edit)}
								>
									<Icon />
								</Button>
							))}
						</div>
						<Textarea
							id="memory-description"
							rows={8}
							placeholder="What do you remember? Markdown works: **bold**, _italic_, - lists, # headings."
							className="min-h-40 text-base md:text-base"
							aria-invalid={!!form.formState.errors.description}
							aria-describedby="memory-description-help"
							{...descriptionField}
							ref={(el) => {
								registerRef(el);
								textarea.current = el;
							}}
						/>
					</TabsContent>
					<TabsContent value="preview" className="min-h-40 rounded-xl border p-3">
						<Preview source={description ?? ""} />
					</TabsContent>
				</Tabs>
				<p id="memory-description-help" className="text-sm text-muted-foreground">
					Optional. Up to {MEMORY_DESCRIPTION_MAX.toLocaleString("en")} characters.
				</p>
				{form.formState.errors.description ? (
					<p role="alert" className="text-sm text-destructive">
						{form.formState.errors.description.message}
					</p>
				) : null}
			</div>
		</FormDrawer>
	);
}
