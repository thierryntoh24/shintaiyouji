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
import { useCallback } from "react";
import { COPYRIGHT, COPYRIGHT_TITLE, SOCIALS } from "@/types/consts";
import { useAppUI } from "@/app/(themes)/neue/contexts/app-ui-context";
import { cn } from "@/lib/utils";

/**
 * Site footer component.
 */
export default function Footer() {
  const { isFocus, toggleFocus, isExpanded, toggleExpanded } = useAppUI();

  const requestBrowserFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {
        // Browser may deny (e.g. in an iframe) — fail silently
      });
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  return (
    <footer className="h-(--header-height) neue-grid items-center py-2">
      <div className="col-span-2" title={COPYRIGHT_TITLE}>
        <span>{COPYRIGHT}</span>
      </div>

      <div className="col-start-5 justify-self-end">
        <button
          onClick={toggleFocus}
          className="hover:underline underline-offset-4 transition-smooth"
        >
          {isFocus ? "CLOSE" : "FOCUS"}
        </button>
      </div>

      {!isFocus && (
        <div className="col-span-2">
          <button
            onClick={toggleExpanded}
            className="underline underline-offset-4"
          >
            {isExpanded ? "LESS" : "MORE"}
          </button>
        </div>
      )}

      {/* {!!isFocus && (
        <div className="col-span-2">
          <button
            onClick={requestBrowserFullscreen}
            className="underline underline-offset-4"
          >
            FULLSCREEN
          </button>
        </div>
      )} */}

      {/* Socials overflow upward */}
      <div
        className={cn(
          "flex flex-col-reverse h-(--header-height) pb-2 transition-smooth",
          !isFocus
            ? "opacity-100"
            : "opacity-0 pointer-events-none select-none",
        )}
      >
        {Object.entries(SOCIALS).map(([key, { label, link }]) => (
          <Link key={key} href={link}>
            {label}
          </Link>
        ))}
      </div>
    </footer>
  );
}
