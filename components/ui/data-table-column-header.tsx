import { Button } from "@/components/ui/button";
import { Column } from "@tanstack/react-table";
import { ArrowDown, ArrowUp } from "lucide-react";

interface DataGridColumnHeaderProps<TData, TValue> {
  column: Column<TData, TValue>;
  title?: string;
  showSort?: boolean;
}

export default function DataGridColumnHeader<TData, TValue>({
  column,
  title = "",
  showSort = true,
}: DataGridColumnHeaderProps<TData, TValue>) {
  return (
    <div className="flex flex-row justify-start items-center gap-1">
      {title}

      {showSort ? (
        <Button
          variant="ghost"
          size="icon"
          className="p-1 w-6 h-6"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          {column.getIsSorted() === "asc" ? (
            <ArrowUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ArrowDown className="h-4 w-4 text-gray-400" />
          )}
        </Button>
      ) : null}
    </div>
  );
}
