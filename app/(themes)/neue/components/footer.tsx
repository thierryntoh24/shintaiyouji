"use client";

/**
 * @file footer.tsx
 * @description Site footer for the Neue theme.
 *
 * Renders in two modes driven by {@link AppUIContext}:
 * - **Normal**: copyright, fullscreen toggle, MORE, social links.
 * - **Fullscreen**: exit-fullscreen and browser-native fullscreen toggles only.
 *
 * The MORE button toggles `isExpanded` in {@link AppUIContext}, which causes
 * the main page to compress the clock row and reveal a larger data panel.
 */

import Link from "next/link";
import { COPYRIGHT, COPYRIGHT_TITLE, SOCIALS } from "@/types/consts";
import { useNeue } from "@/app/(themes)/neue/contexts/ui-context";
import { cn } from "@/lib/utils";

/**
 * Site footer component.
 */
export default function Footer() {
  const { isFocus, toggleFocus, isExpanded, toggleExpanded } = useNeue();

  return (
    <footer className="h-(--header-height) pb-3 mini:max-tablet:px-8 neue-grid items-center py-2">
      <div className="tablet:col-span-2" title={COPYRIGHT_TITLE}>
        <span>{COPYRIGHT}</span>
      </div>

      <div className="desktop:col-start-5 tablet:justify-self-end">
        <button
          onClick={toggleFocus}
          className="hover:underline underline-offset-4 transition-smooth"
        >
          {isFocus ? "CLOSE" : "FOCUS"}
        </button>
      </div>

      <div
        className={cn(
          "desktop:col-span-2 transition-smooth-short max-tablet:justify-self-end",
          !isFocus ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      >
        <button
          onClick={toggleExpanded}
          className="hover:underline underline-offset-4"
        >
          {isExpanded ? "LESS" : "MORE"}
        </button>
      </div>

      {/* Socials overflow upward */}
      <div
        className={cn(
          "max-tablet:hidden tablet:max-desktop:col-span-2 flex flex-col-reverse h-(--header-height) pb-3 gap-1 transition-smooth items-end",
          !isFocus
            ? "opacity-100"
            : "opacity-0 pointer-events-none select-none",
        )}
      >
        {Object.entries(SOCIALS)
          .reverse()
          .map(([key, { label, link }]) => (
            <Link
              key={key}
              href={link}
              rel="noreferrer nofollow"
              target="_blank"
            >
              {label} ↗
            </Link>
          ))}
      </div>
    </footer>
  );
}
