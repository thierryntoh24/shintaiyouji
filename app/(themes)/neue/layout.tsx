import type { ReactNode } from "react";
// import { newsreader } from "@/app/fonts";
import "./neue.css";

import { New_Rocker } from "next/font/google";

const newsreader = New_Rocker({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "400"],
});

/**
 * @file (themes)/neue/layout.tsx
 * @description Layout for the Neue theme.
 *
 * Providers (`AppUIProvider`, `TimeFormatProvider`, `BootProvider`) are
 * intentionally absent here — they live in the root `app/layout.tsx` so
 * their state survives navigation between themed pages and `/map`.
 */
export default function NeueLayout({ children }: { children: ReactNode }) {
  return (
    <main
      data-theme="neue"
      className={`${newsreader.variable} font-medium flex flex-col min-h-screen w-full items-center text-sm [--header-height:calc(--spacing(10))]`}
    >
      {children}
    </main>
  );
}
