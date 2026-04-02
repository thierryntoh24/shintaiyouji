"use client";

import { LoadingUI } from "@/app/(themes)/neue/components/loading";
import { useGlobal } from "@/app/contexts/global-provider";
import { getTheme } from "@/utils/theme-registry";
import { Suspense } from "react";

function Page() {
  const {
    store: { data },
  } = useGlobal();
  const theme = getTheme(data.theme);
  const Home = theme.components.Home;
  return <Home />;
}

export default function HomePage() {
  return (
    <Suspense fallback={<LoadingUI />}>
      <Page />
    </Suspense>
  );
}
