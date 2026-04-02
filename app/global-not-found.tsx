// "use client";
import { Button } from "@/app/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyDescription,
  EmptyContent,
} from "@/app/components/ui/empty";
import "./globals.css";
import { Geist } from "next/font/google";
import type { Metadata } from "next";
import { baseMetadata } from "@/lib/metadata";
// import { useRouter } from "next/router";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  ...baseMetadata,
  title: "404 - Page Not Found",
  description: "The page you are looking for does not exist.",
};

export default function GlobalNotFound() {
  return (
    <html lang="en" className={geist.className}>
      <body className="antialiased">
        <Empty className="h-dvh w-screen overflow-clip">
          <EmptyHeader className="gap-4">
            <div className="flex items-center justify-between gap-2">
              <span>(</span>
              {"利用不可".split("").map((c, i) => (
                <span key={i}>{c}</span>
              ))}
              <span>)</span>
            </div>
            <EmptyDescription className="flex flex-col gap-1 text-primary font-semibold">
              The page you're looking for doesn't exist.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              variant="outline"
              // onClick={() => router.replace("/")}
            >
              Go back
            </Button>
          </EmptyContent>
        </Empty>
      </body>
    </html>
  );
}
