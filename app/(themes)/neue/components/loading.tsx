import {
  Empty,
  EmptyDescription,
  EmptyHeader,
} from "@/app/components/ui/empty";
import { Spinner } from "@/app/components/ui/spinner-2";
import { cn } from "@/lib/utils";

export function LoadingUI({
  message,
}: {
  message?: { title?: string; description: string; instruction?: string };
}) {
  return (
    <Empty className="h-dvh w-screen overflow-clip">
      <EmptyHeader className="gap-4">
        <Spinner className="size-16" strokeWidth={2} />
        {/* {!!message && ( */}
        <EmptyDescription className="flex flex-col gap-1 text-primary font-semibold">
          <span>太陽に同期しています…</span>
          <span className="text-xs">( Syncing with the sun… )</span>
        </EmptyDescription>
        {/* )} */}
      </EmptyHeader>
    </Empty>
  );
}

export function LoadingContained({
  message,
  iconSize,
}: {
  message?: string;
  iconSize?: string;
}) {
  return (
    <Empty className="h-full w-full">
      <EmptyHeader className="gap-4">
        <Spinner className={cn(iconSize ?? "size-10")} strokeWidth={2} />
        {!!message && (
          <EmptyDescription className="flex flex-col gap-1">
            <span>{message}</span>
          </EmptyDescription>
        )}
      </EmptyHeader>
    </Empty>
  );
}
