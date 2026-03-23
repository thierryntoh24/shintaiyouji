import { AppUIProvider } from "@/app/(themes)/neue/contexts/app-ui-context";
import { BootProvider } from "@/app/(themes)/neue/contexts/boot-provider";
import { TimeFormatProvider } from "@/app/(themes)/neue/contexts/time-format-context";
import { ReactNode } from "react";

/**
 * Provider order:
 * 1. {@link AppUIProvider}   — location, TST result, clock offset, fullscreen
 * 2. {@link TimeFormatProvider} — solar mode (TST/MST), hour format
 * 3. {@link BootProvider}    — runs the one-time boot sequence
 */
export default function NeueContext({ children }: { children: ReactNode }) {
  return (
    <AppUIProvider>
      <TimeFormatProvider>
        <BootProvider>{children}</BootProvider>
      </TimeFormatProvider>
    </AppUIProvider>
  );
}
