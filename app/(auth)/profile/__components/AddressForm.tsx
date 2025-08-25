"use client";
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
import { api } from "@/convex/_generated/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState, type FC } from "react";
import { useForm } from "react-hook-form";
import z from "zod";

const formSchema = z.object({
  line1: z.string().min(1, "Line1 is required"),
  line2: z.string().optional(),
  country: z.string().min(1, "Country is required"),
  state: z.string().min(1, "State is required"),
  city: z.string().min(1, "City is required"),
  postalCode: z.string().min(1, "Postal Code is required"),
  type: z.enum(["home", "work", "other"]),
  note: z.string().optional(),
  digipin: z
    .string()
    .regex(/^[0-9A-Z]{3}-[0-9A-Z]{3}-[0-9A-Z]{4}$/, "Invalid Digipin"),
});

interface Props {}

const AddressForm: FC<Props> = () => {
  const [open, setOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const addAddressAction = useMutation(api.address.addAddress);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      line1: "",
      line2: "",
      country: "",
      state: "",
      city: "",
      postalCode: "",
      type: "home",
      note: "",
      digipin: "",
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setIsLoading(() => true);

    await addAddressAction({
      line1: values.line1,
      line2: values?.line2 ? values.line2 : undefined,
      country: values?.country,
      state: values?.state,
      city: values?.city,
      postalCode: values?.postalCode,
      type: values?.type,
      note: values?.note ? values.note : undefined,
      digipin: values?.digipin,
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
            <Button variant="outline">Add Address</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Address form</DialogTitle>
              <DialogDescription>
                Add your home, work or other address for family
              </DialogDescription>
            </DialogHeader>
            <div className="w-full gap-2 grid grid-cols-2">
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
                        <SelectItem value="home">Home</SelectItem>
                        <SelectItem value="work">Work</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
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
                      <Input placeholder="Line1" {...field} required />
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
                      <Input placeholder="Line2" {...field} />
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
                      <Input placeholder="Country" {...field} required />
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
                      <Input placeholder="State" {...field} required />
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
                      <Input placeholder="City" {...field} required />
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
                      <Input placeholder="Postal Code" {...field} required />
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
                      <Input placeholder="Digipin" {...field} required />
                    </FormControl>
                    <FormDescription>
                      Get your Digipin{" "}
                      <a
                        target="_blank"
                        className="underline"
                        href="https://dac.indiapost.gov.in/mydigipin/home"
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
                  <FormItem>
                    <FormLabel>Note</FormLabel>
                    <FormControl>
                      <Input placeholder="Note" {...field} required />
                    </FormControl>
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
                Add address
              </Button>
            </DialogFooter>
          </DialogContent>
        </form>
      </Form>
    </Dialog>
  );
};

export default AddressForm;
