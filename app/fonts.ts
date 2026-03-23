import localFont from "next/font/local";

export const newsreader = localFont({
  src: [
    {
      path: "../public/fonts/newsreader/newsreader-variable.woff2",
      weight: "100 900",
      style: "normal",
    },
    {
      path: "../public/fonts/newsreader/newsreader-italic-variable.woff2",
      weight: "100 900",
      style: "italic",
    },
  ],
  variable: "--font-newsreader",
});
