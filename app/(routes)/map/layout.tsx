import type { Metadata } from "next";
import { baseMetadata } from "@/lib/metadata";
import { ReactNode } from "react";

/**
 * Metadata for the interactive map page.
 */
export const metadata: Metadata = {
  ...baseMetadata,
  title: "Map",
  description:
    "Explore true solar time across the globe. Click anywhere to see local solar time and sun position in real-time.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
