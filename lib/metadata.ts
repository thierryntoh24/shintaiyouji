import type { Metadata } from "next";

/**
 * Base metadata shared across all pages.
 * Includes SEO defaults, OpenGraph, and Twitter config.
 */
export const baseMetadata: Metadata = {
  metadataBase: new URL("https://true-time.vercel.app"),
  title: {
    default: "真太陽時 — True Solar Time",
    template: "%s — 真太陽時",
  },
  description:
    "Experience time as it truly is — calculated from the sun, not political timezones. 真太陽時 (True Solar Time) shows your real local solar time anywhere on Earth.",
  keywords: [
    "true solar time",
    "solar time",
    "astronomy",
    "longitude time",
    "timezone alternative",
    "equation of time",
    "sun position",
  ],
  authors: [{ name: "Thièrry Ntoh" }],
  creator: "Thièrry Ntoh",

  openGraph: {
    type: "website",
    siteName: "真太陽時",
    title: "真太陽時 — True Solar Time",
    description:
      "Time based on the sun, not borders. See your real solar time anywhere on Earth.",
    url: "https://true-time.vercel.app",
    images: [
      {
        url: "/og/default",
        width: 1200,
        height: 630,
        alt: "True Solar Time",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "真太陽時 — True Solar Time",
    description: "Time based on the sun, not borders.",
    images: ["/og/default"],
  },

  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};
