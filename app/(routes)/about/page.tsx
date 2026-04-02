"use client";

/**
 * @file about.tsx
 * @description About page based on the Neue theme.
 */

import Link from "next/link";
import { COPYRIGHT, COPYRIGHT_TITLE, SITENAME, SOCIALS } from "@/types/consts";
import "../../(themes)/neue/styles/neue.css";
import { cn } from "@/lib/utils";
import { useGlobal } from "@/app/contexts/global-provider";
import { LoadingUI } from "@/app/(themes)/neue/components/loading";
import Header from "@/app/(routes)/about/header";

export default function About() {
  const { status, active } = useGlobal();

  // -------------------------------------------------------------------------
  // Render guard
  // -------------------------------------------------------------------------

  if (status !== "ready" || !active)
    return (
      <LoadingUI message={{ description: "Getting everything ready..." }} />
    );

  return (
    <>
      <div
        className="fixed top-0 left-0 right-0 z-5 bg-background"
        // style={{ mixBlendMode: "difference" }}
      >
        <Header />
      </div>
      <main className="flex-1 w-full py-10 pb-12 flex flex-col gap-10 tablet:gap-20">
        <section className="flex flex-col gap-1">
          {/* <div className="col-start-2 col-span-6 text-8xl">しん の じかん</div> */}
          <div
            className={cn(
              "p-5 col-span-3 text-5xl text-center w-full flex items-center justify-between",
              "py-10",
              " tablet:text-[11rem]",
              "laptop:col-span-full",
            )}
            style={{
              textBox: "trim-both",
              // fontSize: "clamp(3.125rem, 3.464vw + 2.229rem, 5rem)",
            }}
          >
            <span>(</span>
            {SITENAME.split("").map((c, i) => (
              <span key={i}>{c}</span>
            ))}
            <span>)</span>
            {/* シン ノ ジカン */}
            {/* シンタイヨウジ */}
          </div>
          <div className="neue-grid ">
            <div
              className={cn(
                " tablet:justify-self-end tablet:text-right",
                "laptop:col-start-2",
              )}
              title="english"
            >
              [ 英語 :
            </div>
            <div className="tablet:col-start-2 laptop:col-start-3 col-span-2">
              True solar time ]
            </div>
            <div
              className={cn(
                "col-start-2 col-span-2",
                "tablet:col-start-4 flex flex-col max-tablet:order-1",
                "laptop:col-start-6",
              )}
            >
              <span title="hiragana">/ しんたいようじ</span>
              <span title="katakana">/ シンタイヨウジ</span>
              <span title="romanji">/ Shintaiyōji</span>
            </div>
          </div>
        </section>

        {/* ── Origin ─────────────────────────────────────────────────────── */}
        <section className="neue-grid gap-4">
          <h3
            className={cn(
              "laptop:col-start-2 tablet:justify-self-end tablet:text-right  max-tablet:whitespace-nowrap pt-1",
            )}
            title="なぜ作ったのか"
          >
            Why / なぜ / 何故作ったのか
          </h3>
          <div
            className={cn(
              "flex flex-col gap-4 col-span-3",
              "laptop:col-start-3 tablet:text-lg tablet:col-span-4",
            )}
          >
            <p className="leading-relaxed">
              This started as a small act of frustration with timezones. China,
              all five million square kilometres of it, runs on a single
              timezone. Beijing time, everywhere, always. Sunrise in Xinjiang
              happens at 10am. There's also India's UTC+5:30 and Nepal's
              UTC+5:45, just to be different, and Spain using CET despite
              sitting further west, pushing noon in Madrid well past 1pm. The
              whole system is a patchwork of political decisions dressed up as
              geography.
            </p>
            <p className="leading-relaxed">
              So I built something that ignores all of that. No timezones. No
              committees. Just you, your longitude, and the sun.
            </p>
            <p className="leading-relaxed">
              It turned into a rabbit hole. Then a fun project. Now it's this. I
              ended up learning a lot about time and the sun
            </p>
          </div>
        </section>

        {/* ── How it works ───────────────────────────────────────────────── */}
        <section className="neue-grid gap-4">
          <h3 className="laptop:col-start-2 tablet:justify-self-end tablet:text-right max-tablet:whitespace-nowrap pt-1">
            How / しくみ / 仕組み
          </h3>
          <div
            className={cn(
              "flex flex-col gap-4 col-span-3",
              "laptop:col-start-3 tablet:text-lg tablet:col-span-4",
            )}
          >
            <p>There are two modes;</p>
            <p>
              <em>True Solar Time (TST)</em> is the real one — it tracks the
              actual Sun, including the Equation of Time: a ±16 minute wobble
              caused by Earth's elliptical orbit and axial tilt. Solar noon in
              TST is always exactly 12:00:00, because that's what solar noon
              means.
            </p>
            <p>
              <em>Mean Solar Time (MST)</em> smooths out the wobble. It's what
              clocks were designed to approximate before timezones turned
              everything into a political negotiation. Still
              longitude-corrected, just without the annual variation.
            </p>
            <p>
              The solar position calculations — altitude, azimuth, declination,
              hour angle, Earth–Sun distance — come from Jean Meeus'
              <Link
                href="https://www.amazon.com/Astronomical-Algorithms-Jean-Meeus/dp/0943396611"
                className="italic underline"
                rel="noreferrer nofollow"
                target="_blank"
              >
                Astronomical Algorithms (2nd ed., 1998)
              </Link>{" "}
              and the{" "}
              <Link
                href="https://gml.noaa.gov/grad/solcalc/calcdetails.html"
                rel="noreferrer nofollow"
                target="_blank"
                className="underline"
              >
                NOAA Solar Position Algorithm
              </Link>
              . The Equation of Time uses NOAA standard Fourier series{" "}
              <Link
                href="https://www.esrl.noaa.gov/gmd/grad/solcalc/solareqns.PDF"
                rel="noreferrer nofollow"
                target="_blank"
                className="underline"
              >
                (Spencer 1971 / Iqbal 1983)
              </Link>
              . The moon data uses Meeus Chapter 47's truncated series, which is
              accurate to roughly ±0.3°.
            </p>

            <p>
              Solar event times — sunrise, sunset, civil/nautical/astronomical
              twilight, golden hour — are solved by bisection on the sun's
              altitude function, and are ccurate to around ±30 seconds for most
              latitudes.
            </p>
          </div>
        </section>

        {/* ── Open source ────────────────────────────────────────────────── */}
        <section className="neue-grid gap-4">
          <h3 className="laptop:col-start-2 tablet:justify-self-end tablet:text-right max-tablet:whitespace-nowrap pt-1">
            Open source / オープンソース
          </h3>
          <div
            className={cn(
              "flex flex-col gap-4 col-span-3",
              "laptop:col-start-3 tablet:text-lg tablet:col-span-4",
            )}
          >
            <p className="leading-relaxed">
              The astronomy engine, shared hooks, and data pipeline are all
              public, so anyone can build a completely different interface on
              top of the same calculations.
            </p>
            <p className="leading-relaxed">
              If you want to contribute, build a theme, or just poke around the
              astronomy code, the repo is on{" "}
              <Link
                href={SOCIALS.github.link}
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </Link>
              .
            </p>
          </div>
        </section>

        {/* ── Credits ────────────────────────────────────────────────────── */}
        <section className="neue-grid gap-4">
          <h3 className="laptop:col-start-2 tablet:justify-self-end tablet:text-right  pt-1 whitespace-nowrap">
            Credits / しゃじ / 謝辞
          </h3>
          <div
            className={cn(
              "flex flex-col gap-4 col-span-3",
              "tablet:col-start-3 laptop:col-start-5 tablet:gap-1",
            )}
          >
            <div className="neue-grid-small">
              <span className="tablet:justify-self-end">Astronomy</span>
              <div className="col-span-2 flex flex-col gap-4 tablet:gap-0.5">
                <Link
                  href="https://www.amazon.com/Astronomical-Algorithms-Jean-Meeus/dp/0943396611"
                  rel="noreferrer nofollow"
                  target="_blank"
                >
                  Jean Meeus ( Astronomical Algorithms, 2nd ed. (1998) )
                </Link>
                <Link
                  href="https://gml.noaa.gov/grad/solcalc/calcdetails.html"
                  rel="noreferrer nofollow"
                  target="_blank"
                >
                  NOAA Solar Position Algorithm
                </Link>
                <Link
                  href="https://www.esrl.noaa.gov/gmd/grad/solcalc/solareqns.PDF"
                  rel="noreferrer nofollow"
                  target="_blank"
                >
                  EoT methodology (Spencer 1971 / Iqbal 1983)
                </Link>
              </div>
            </div>
            <div className="neue-grid-small">
              <span className="tablet:justify-self-end">Geocoding</span>
              <Link
                href="https://nominatim.org/release-docs/latest/api/Overview/"
                rel="noreferrer nofollow"
                target="_blank"
                className="col-span-2 flex flex-col"
              >
                Nominatim / OpenStreetMap
              </Link>
            </div>
            <div className="neue-grid-small">
              <span className="tablet:justify-self-end">Weather</span>
              <Link
                href="https://open-meteo.com/en/docs"
                rel="noreferrer nofollow"
                target="_blank"
                className="col-span-2 flex flex-col"
              >
                Open-Meteo
              </Link>
            </div>
            <div className="neue-grid-small">
              <span className="tablet:justify-self-end">
                Timezone resolution
              </span>
              <Link
                href="https://timeapi.io"
                rel="noreferrer nofollow"
                target="_blank"
                className="col-span-2 flex flex-col"
              >
                Time API / TimezoneDB
              </Link>
            </div>
            <div className="neue-grid-small">
              <span className="tablet:justify-self-end">Mapping</span>
              <Link
                href="https://timeapi.io"
                rel="noreferrer nofollow"
                target="_blank"
                className="col-span-2 flex flex-col"
              >
                Maplibre / MapTiler
              </Link>
            </div>
            <div className="neue-grid-small">
              <span className="tablet:justify-self-end">Assistant</span>
              <Link
                href="https://claude.ai"
                rel="noreferrer nofollow"
                target="_blank"
                className="col-span-2 flex flex-col"
              >
                Claude
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="h-(--header-height) pb-3 mini:max-tablet:px-8 neue-grid items-center py-2">
        <div className="tablet:col-span-2" title={COPYRIGHT_TITLE}>
          <span>{COPYRIGHT}</span>
        </div>

        <div className="max-tablet:hidden laptop:col-start-5 justify-self-end">
          <span>Contact</span>
        </div>

        {/* Socials overflow upward */}
        <div
          className={cn(
            "tablet:col-span-2 flex flex-col-reverse h-(--header-height) pb-2.5 gap-1",
          )}
        >
          {Object.entries(SOCIALS)
            .reverse()
            .map(([key, { label, link }]) => (
              <Link
                key={key}
                href={link}
                rel="noreferrer nofollow"
                target="_blank"
                className="whitespace-nowrap shrink-0"
              >
                {label} ↗
              </Link>
            ))}
        </div>

        <div className=" justify-self-end" title="Yaounde, Cameroon">
          <Link target="_blank" href={"/?lat=3.85495&lon=11.50270"}>
            Yde, CMR
          </Link>
        </div>
      </footer>
    </>
  );
}
