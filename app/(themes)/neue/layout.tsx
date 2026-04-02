import type { ReactNode } from "react";
import "./styles/neue.css";

import { NeueProvider } from "@/app/(themes)/neue/contexts/ui-context";

/**
 * @file (themes)/neue/layout.tsx
 * @description Layout for the Neue theme.
 *
 * Providers (`NeueProvider`, `BootProvider`) are
 * intentionally absent here — they live in the root `app/layout.tsx` so
 * their state survives navigation between themed pages and `/map`.
 */
export default function NeueLayout({ children }: { children: ReactNode }) {
  return (
    <main
      data-theme="neue"
      className={` font-semibold flex flex-col min-h-dvh overflow-clip w-full items-center text-sm [--header-height:calc(--spacing(10))]`}
    >
      <NeueProvider>{children}</NeueProvider>
    </main>
  );
}
