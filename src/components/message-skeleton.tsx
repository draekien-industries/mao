import { Skeleton } from "@/components/ui/skeleton";

export function MessageSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4">
      {/* User skeleton -- right-aligned */}
      <div className="flex justify-end">
        <Skeleton className="h-9 w-[45%] rounded-2xl bg-primary/20" />
      </div>
      {/* Assistant skeleton -- left-aligned */}
      <div className="flex justify-start">
        <Skeleton className="h-[52px] w-[70%] rounded-2xl bg-muted" />
      </div>
      {/* User skeleton -- right-aligned */}
      <div className="flex justify-end">
        <Skeleton className="h-9 w-[55%] rounded-2xl bg-primary/20" />
      </div>
    </div>
  );
}
