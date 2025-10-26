import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="w-full h-full flex flex-col justify-center items-center gap-2">
      <Loader2 className="w-12 h-12 animate-spin text-gray-400" />
      <p className="font-p">Building Family Tree...</p>
    </div>
  );
}
