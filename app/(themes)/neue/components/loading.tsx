import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/app/components/ui/avatar";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/app/components/ui/empty";
import { Spinner } from "@/app/components/ui/spinner-2";

export function LoadingUI({
  message,
}: {
  message?: { title?: string; description: string; instruction?: string };
}) {
  return (
    <Empty className="h-screen w-screen">
      <EmptyHeader className="gap-4">
        <Spinner className="size-16" strokeWidth={2} />
        {!!message && (
          <EmptyDescription className="flex flex-col gap-1">
            <span>{message.description}</span>
            <span>{message.instruction}</span>
          </EmptyDescription>
        )}
      </EmptyHeader>
    </Empty>
  );
}
