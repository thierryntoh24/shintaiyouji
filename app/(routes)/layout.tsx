"use client";

/**
 * @file (routeds)/layout.tsx
 * @description Layout wrapper for the theme routes.
 *
 * This is where theme routes (home, map) live.
 * This is intentional so as not to rerender the global provider
 * when navigating to /about, which doesnt depend on a theme layout.
 */

import { useGlobal } from "@/app/contexts/global-provider";
import { getTheme } from "@/utils/theme-registry";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

export default function LayoutResolver({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const {
    store: { data, update },
  } = useGlobal();

  const themeParam = searchParams.get("theme") as Themes | null;
  if (themeParam) update({ theme: themeParam });

  // Kinda roundabout but neccesary for theme to be reactive
  // since we need the PreferencesProvider
  const theme = getTheme(themeParam ?? data.theme);
  const Layout = theme.components.Layout;

  return <Layout>{children}</Layout>;
}
