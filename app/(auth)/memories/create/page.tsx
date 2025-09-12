"use client";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FC } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
  images: z
    .array(z.file())
    .min(1, "At least one image is required")
    .refine(
      (fileList) => fileList.every((file) => file.size < 5 * 1024 * 1024),
      "File size must be less than 5MB",
    )
    .refine(
      (fileList) => fileList.every((file) => file.type.startsWith("image/")),
      "Only image files are allowed",
    ),
});

interface Props {}

const CreateMemoryPage: FC<Props> = () => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const generateUploadUrl = useMutation(api.memories.generateMemoryUploadUrl);
  const createMemoryAction = useMutation(api.memories.createMemory);
  const router = useRouter();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      content: "",
      images: [],
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setIsLoading(() => true);
    try {
      const pictureStorageIds: Array<Id<"_storage">> = [];

      for (const image of values.images) {
        const uploadUrl = await generateUploadUrl();
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": image!.type },
          body: image,
        });
        if (!response.ok) {
          throw new Error("Failed to upload profile picture");
        }
        const { storageId } = await response.json();

        pictureStorageIds.push(storageId);
      }

      const createdMemoryId = await createMemoryAction({
        title: values.title,
        content: values.content,
        images: pictureStorageIds,
      });
      toast.success("Memory created successfully");
      router.push(`/memories/${createdMemoryId}`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to create memory");
    } finally {
      setIsLoading(() => false);
    }
  });

  return (
    <div className="w-full flex flex-col justify-start items-start gap-2">
      <div className="flex flex-col items-start justify-start">
        <h2 className="font-bold text-2xl">Create Memory</h2>
        <p className="text-muted-foreground">
          Create memory to share with your family
        </p>
      </div>
      <form className="w-full" onSubmit={onSubmit}>
        <Form {...form}>
          <div className="w-full flex flex-col justify-start items-start gap-4">
            <FormField
              control={form.control}
              name="images"
              render={({ field }) => {
                if (field.value && field.value.length > 0) {
                  const imageUrls: string[] = [];
                  for (let i = 0; i < field.value.length; i++) {
                    imageUrls.push(URL.createObjectURL(field.value[i]));
                  }
                  return (
                    <FormItem className="w-full">
                      <div className="grid gap-2 w-full">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {imageUrls.map((image, index) => (
                            <img
                              key={image}
                              loading="lazy"
                              src={image}
                              alt={`Image ${index}`}
                              className="h-[200px] w-full object-contain mx-auto"
                            />
                          ))}
                        </div>

                        <Button
                          type="button"
                          onClick={() => form.resetField("images")}
                          className="w-[100px] mx-auto"
                        >
                          Remove
                        </Button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  );
                }
                return (
                  <FormItem className="w-full">
                    <FormLabel>Images</FormLabel>
                    <FormControl>
                      <Input
                        onChange={(e) => {
                          if (e.target.files) {
                            const files: File[] = [];
                            for (let i = 0; i < e.target.files.length; i++) {
                              const file = e.target.files[i];
                              files.push(file);
                            }

                            field.onChange(files);
                          }
                        }}
                        type="file"
                        accept="image/*"
                        multiple
                        required
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem className="w-full">
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Title" {...field} required />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem className="w-full">
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Write something about this memory"
                      {...field}
                      required
                      rows={150}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={isLoading} onClick={onSubmit}>
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Create Memory
            </Button>
          </div>
        </Form>
      </form>
    </div>
  );
};

export default CreateMemoryPage;
