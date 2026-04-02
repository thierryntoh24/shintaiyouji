"use client";

import { LoadingUI } from "@/app/(themes)/neue/components/loading";
import { useGlobal } from "@/app/contexts/global-provider";
import { getTheme } from "@/utils/theme-registry";
import { notFound } from "next/navigation";
import { Suspense } from "react";

function Page() {
  const {
    store: { data },
  } = useGlobal();
  const theme = getTheme(data.theme);
  const Map = theme.components.Map;
  if (!Map) notFound();
  return <Map />;
}

export default function MapPage() {
  return (
    <Suspense fallback={<LoadingUI />}>
      <Page />
    </Suspense>
  );
}
