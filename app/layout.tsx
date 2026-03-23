import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SITENAME } from "@/types/consts";
import { getTheme } from "@/utils/get-theme";
import NeueContext from "@/app/(themes)/neue/contexts";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: SITENAME,
  description: "Time based purely on Earth’s rotation and geographic position",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // const theme = getTheme();

  // const AppContext = theme.components.Context;

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <NeueContext>{children}</NeueContext>
      </body>
    </html>
  );
}
