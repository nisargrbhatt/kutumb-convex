"use client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { Edit, Loader2 } from "lucide-react";
import { useState, type FC } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";

type ProfileObject = (typeof api.profile.getProfile)["_returnType"]["profile"];

const formSchema = z.object({
  picture: z
    .file()
    .refine(
      (file) => file.size < 5 * 1024 * 1024,
      "File size must be less than 5MB",
    ),
});

interface Props {
  picture: ProfileObject["picture"];
}

const ProfilePictureForm: FC<Props> = ({ picture }) => {
  const [open, setOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const generateUploadUrl = useMutation(api.profile.generateProfileUploadUrl);
  const changePictureAction = useMutation(api.profile.changeMyProfilePicture);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      picture: undefined,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setIsLoading(() => true);
    try {
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": values.picture!.type },
        body: values.picture,
      });
      if (!response.ok) {
        throw new Error("Failed to upload profile picture");
      }
      const { storageId } = await response.json();
      await changePictureAction({ storageId });
      setOpen(() => false);
      form.reset();
    } catch (error) {
      console.error(error);
      toast.error("Failed to change profile picture");
    } finally {
      setIsLoading(() => false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Form {...form}>
        <DialogTrigger asChild>
          <div className="flex items-center justify-center w-full">
            <Tooltip>
              <TooltipTrigger>
                <Avatar className="w-[250px] h-[250px]">
                  <AvatarImage src={picture ?? undefined} />
                  <AvatarFallback>P</AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>
                <p>Click to Edit Profile Picture</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Profile Picture</DialogTitle>
            <DialogDescription>
              Select image less than 5MB to change it to your profile picture
            </DialogDescription>
          </DialogHeader>
          <div className="w-full gap-2 grid grid-cols-1">
            <FormField
              control={form.control}
              name="picture"
              render={({ field }) => {
                if (field.value) {
                  return (
                    <div className="grid gap-2">
                      <img
                        loading="lazy"
                        src={URL.createObjectURL(field.value)}
                        alt="profile-picture"
                      />
                      <Button
                        type="button"
                        onClick={() => form.resetField("picture")}
                      >
                        Remove
                      </Button>
                    </div>
                  );
                }
                return (
                  <FormItem>
                    <FormLabel>Picture</FormLabel>
                    <FormControl>
                      <Input
                        onChange={(e) => field.onChange(e.target.files?.[0])}
                        type="file"
                        accept="image/*"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isLoading} onClick={onSubmit}>
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Form>
    </Dialog>
  );
};

export default ProfilePictureForm;
