import type { ReactNode } from "react";

import type { Metadata } from "next";
import { baseMetadata } from "@/lib/metadata";

/**
 * Metadata for the about page.
 */
export const metadata: Metadata = {
  ...baseMetadata,
  title: "About",
  description:
    "Why 真太陽時 exists, how true solar time works, and the philosophy behind abandoning timezones.",
};

export default function AboutLayout({ children }: { children: ReactNode }) {
  return (
    <div className="w-full min-h-dvh text-sm font-semibold [--header-height:calc(--spacing(10))] relative">
      {children}
    </div>
  );
}
