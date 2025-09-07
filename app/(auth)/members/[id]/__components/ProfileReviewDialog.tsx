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
import { useTransition, type FC } from "react";
import { useForm } from "react-hook-form";
import z from "zod";

type ProfileObject = NonNullable<
  (typeof api.profile.getProfileDetail)["_returnType"]
>["profile"];

const formSchema = z.object({
  status: z.enum(["active", "inactive"]),
  comment: z.string().optional(),
});

interface Props {
  id: ProfileObject["_id"];
}

const ProfileReviewDialog: FC<Props> = ({ id }) => {
  const [loading, startTransition] = useTransition();
  const reviewProfileAction = useMutation(api.profile.reviewProfile);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      status: "active",
      comment: "",
    },
  });

  const onSubmit = form.handleSubmit(async (data) => {
    startTransition(async () => {
      await reviewProfileAction({
        id: id,
        status: data.status,
        comment: data?.comment ? data.comment : undefined,
      });
    });
  });

  return (
    <Dialog>
      <Form {...form}>
        <form noValidate onSubmit={onSubmit}>
          <DialogTrigger asChild>
            <Button variant="outline">Review</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Review profile</DialogTitle>
              <DialogDescription>
                Accept or Reject the profile with comments.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <FormField
                control={form.control}
                name="status"
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
                        <SelectItem value="active">Accept</SelectItem>
                        <SelectItem value="inactive">Reject</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="comment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Comment</FormLabel>
                    <FormControl>
                      <Input placeholder="Any reason" {...field} required />
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
              <Button type="submit" onClick={onSubmit} disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  ""
                )}
                Review
              </Button>
            </DialogFooter>
          </DialogContent>
        </form>
      </Form>
    </Dialog>
  );
};

export default ProfileReviewDialog;
