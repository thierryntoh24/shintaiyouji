"use client";

import { HomeClockDisplay } from "@/app/(themes)/neue/components/header";
import { useNotifications } from "@/app/(themes)/neue/hooks/use-notifications";
import { useGlobal } from "@/app/contexts/global-provider";
import { nowDate } from "@/lib/ntp";
import { cn } from "@/lib/utils";
import { SITENAME } from "@/types/consts";
import { formatDate } from "@/utils";
import Link from "next/link";

export default function AboutHeader() {
  const { home, homeRes } = useGlobal();
  const {
    store: {
      data: { solarMode },
    },
  } = useGlobal();
  const notifications = useNotifications();

  const activeDate = homeRes
    ? solarMode === "TST"
      ? homeRes.trueSolarTime
      : homeRes.meanSolarTime
    : nowDate();

  return (
    <header className="neue-grid pt-3 h-(--header-height) items-center w-full">
      {/* Site name */}
      <Link href="/">{SITENAME}</Link>

      {/* Notifications — hidden in focus mode */}
      <div
        className={cn("max-tablet:hidden col-span-2 flex items-center ")}
        title={notifications[0]}
      >
        <span className={cn("truncate")}>{notifications[0]}</span>
      </div>

      {/* Active date */}
      <div
        className="laptop:col-span-2 justify-self-start laptop:justify-self-end"
        title={`Current date in ${home?.label.title}`}
      >
        {formatDate(activeDate)}
      </div>

      {/* Home clock */}
      <div className="laptop:col-start-6 laptop:col-start-7 laptop:col-span-2">
        <HomeClockDisplay showCivil={true} />
      </div>
    </header>
  );
}
