import { useMemo, useState, type FC } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import z from "zod";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";

const formSchema = z.object({
  toProfileId: z.string().min(1, "To Profile is required"),
  type: z.enum([
    "brother",
    "brother_in_law",
    "child",
    "father",
    "father_in_law",
    "mother",
    "mother_in_law",
    "sister",
    "sister_in_law",
    "wife",
    "husband",
    "uncle",
    "aunt",
  ]),
  note: z.string().optional(),
  bloodRelation: z.boolean(),
});

interface Props {
  profileId: string;
}

const RelationshipForm: FC<Props> = ({ profileId }) => {
  const [open, setOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const profileOptionList = useQuery(api.profile.listProfileOptions);
  const addRelationAction = useMutation(api.relations.addMyRelation);

  const filteredProfile = useMemo(() => {
    return (
      profileOptionList?.filter((profile) => profile._id !== profileId) ?? []
    );
  }, [profileOptionList, profileId]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      toProfileId: "",
      type: "brother",
      note: "",
      bloodRelation: false,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setIsLoading(() => true);

    await addRelationAction({
      toProfileId: values.toProfileId as Id<"profile">,
      type: values.type,
      note: values?.note ? values?.note : undefined,
      bloodRelation: values.bloodRelation,
    });

    setIsLoading(() => false);
    setOpen(() => false);
    form.reset();
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Form {...form}>
        <form noValidate onSubmit={onSubmit}>
          <DialogTrigger asChild>
            <Button variant="outline">Add Relation</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Relation form</DialogTitle>
              <DialogDescription>
                Add your relation to other family member
              </DialogDescription>
            </DialogHeader>
            <div className="w-full gap-2 grid grid-cols-1">
              <FormField
                control={form.control}
                name="toProfileId"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Member</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            className={cn(
                              "w-full justify-between",
                              !field.value && "text-muted-foreground",
                            )}
                          >
                            {field.value
                              ? filteredProfile?.find(
                                  (language) => language._id === field.value,
                                )?.name
                              : "Select member"}
                            <ChevronsUpDown className="opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0">
                        <Command>
                          <CommandInput
                            placeholder="Search member..."
                            className="h-9"
                          />
                          <CommandList>
                            <CommandEmpty>
                              No member found.
                              <br /> Add missing member{" "}
                              <Link
                                className="underline"
                                href="/members/create"
                              >
                                here
                              </Link>
                            </CommandEmpty>
                            <CommandGroup>
                              {filteredProfile?.map((profile) => (
                                <CommandItem
                                  value={profile._id}
                                  key={profile._id}
                                  onSelect={() => {
                                    form.setValue("toProfileId", profile._id);
                                  }}
                                >
                                  <div className="flex flex-row justify-start items-center w-full gap-1">
                                    <Avatar>
                                      <AvatarImage src={profile?.picture} />
                                      <AvatarFallback>
                                        {profile?.name?.at(0)?.toUpperCase()}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div className="flex flex-col items-start justify-center flex-1">
                                      <p className="font-semibold text-xs">
                                        {profile.name}
                                      </p>
                                      <p className="text-xs font-light">
                                        {profile.email}
                                      </p>
                                      <p className="text-xs font-light">
                                        {profile.mobileNumber}
                                      </p>
                                    </div>

                                    <Check
                                      className={cn(
                                        "ml-auto",
                                        profile._id === field.value
                                          ? "opacity-100"
                                          : "opacity-0",
                                      )}
                                    />
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>

                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="brother">Brother</SelectItem>
                        <SelectItem value="brother_in_law">
                          Brother In Law
                        </SelectItem>
                        <SelectItem value="child">Child</SelectItem>
                        <SelectItem value="father">Father</SelectItem>
                        <SelectItem value="father_in_law">
                          Father In Law
                        </SelectItem>
                        <SelectItem value="mother">Mother</SelectItem>
                        <SelectItem value="mother_in_law">
                          Mother In Law
                        </SelectItem>
                        <SelectItem value="sister">Sister</SelectItem>
                        <SelectItem value="sister_in_law">
                          Sister In Law
                        </SelectItem>
                        <SelectItem value="wife">Wife</SelectItem>
                        <SelectItem value="husband">Husband</SelectItem>
                        <SelectItem value="uncle">Uncle</SelectItem>
                        <SelectItem value="aunt">Aunt</SelectItem>
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
                  <FormItem className="flex flex-row items-center justify-between p-3">
                    <div className="">
                      <FormLabel>Blood Relation</FormLabel>
                      <FormDescription>
                        Is this a blood relation to member or not?
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
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
                      <Input placeholder="Note" {...field} />
                    </FormControl>
                    <FormDescription>
                      Add any additional information about the relation.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={isLoading} onClick={onSubmit}>
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Add relation
              </Button>
            </DialogFooter>
          </DialogContent>
        </form>
      </Form>
    </Dialog>
  );
};

export default RelationshipForm;
