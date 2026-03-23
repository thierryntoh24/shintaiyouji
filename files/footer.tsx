"use client";

import { COPYWRIGHT, SOCIALS } from "@/types/consts";
import Link from "next/link";
import { useAppUI } from "@/app/(themes)/neue/contexts/app-ui-context";
import { useCallback } from "react";

/**
 * Site footer. Renders in two modes driven by {@link AppUIContext}:
 *
 * - **Normal**: copyright, FULLSCREEN toggle, MORE toggle, socials.
 * - **Fullscreen**: exit-fullscreen button and browser-native fullscreen toggle.
 *
 * The MORE button toggles `isExpanded` in {@link AppUIContext}, which causes
 * the main page to compress the clock row and reveal a larger data panel.
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

  if (isFocus) {
    return (
      <footer className="h-(--header-height) neue-grid items-center py-2">
        {/* Exit app fullscreen */}
        <div className="col-start-5 justify-self-end">
          <button
            onClick={toggleFocus}
            className="hover:underline underline-offset-4"
          >
            EXIT
          </button>
        </div>

        {/* Browser native fullscreen (F11 equivalent) */}
        <div className="col-span-2">
          <button
            onClick={requestBrowserFullscreen}
            className="hover:underline underline-offset-4"
          >
            BROWSER FS
          </button>
        </div>
      </footer>
    );
  }

  return (
    <footer className="h-(--header-height) neue-grid items-center py-2">
      <div>
        <span>{COPYWRIGHT}</span>
      </div>

      <div className="col-start-5 justify-self-end">
        <button
          onClick={toggleFocus}
          className="hover:underline underline-offset-4"
        >
          FULLSCREEN
        </button>
      </div>

      {/* MORE — toggles expanded data panel */}
      <div className="col-span-2">
        <button
          onClick={toggleExpanded}
          className="hover:underline underline-offset-4"
        >
          {isExpanded ? "LESS" : "MORE"}
        </button>
      </div>

      {/* Socials — overflow upward */}
      <div className="flex flex-col-reverse h-(--header-height) pb-2 overflow-visible">
        {Object.entries(SOCIALS).map(([k, v]) => (
          <Link key={k} href={v.link}>
            {v.label}
          </Link>
        ))}
      </div>
    </footer>
  );
}
