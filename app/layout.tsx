import type { Metadata, Viewport } from "next";
import { baseMetadata } from "@/lib/metadata";
import "./globals.css";
import fonts from "@/app/fonts";
import { GlobalProvider } from "@/app/contexts/global-provider";
import { Suspense } from "react";
import { LoadingUI } from "@/app/(themes)/neue/components/loading";

// export const metadata: Metadata = {
//   title: SITENAME,
//   description: "Time based purely on Earth’s rotation and geographic position",
// };

/**
 * Root layout metadata & viewport configuration.
 */
export const metadata: Metadata = baseMetadata;

/**
 * Global viewport configuration including browser UI theming.
 */
export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${fonts} antialiased`}>
        {/* Global user state */}
        <Suspense fallback={<LoadingUI />}>
          <GlobalProvider>{children}</GlobalProvider>
        </Suspense>
      </body>
    </html>
  );
}
