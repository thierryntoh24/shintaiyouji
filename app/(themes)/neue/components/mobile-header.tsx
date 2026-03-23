"use client";

/**
 * @file mobile-header.tsx
 * @description Mobile header and bottom drawer for the Neue theme.
 *
 * The header strip is intentionally minimal — site name, current date,
 * and a single trigger that opens the drawer. All navigation, search,
 * notifications, and the anchored home clock live inside the drawer.
 *
 * Drawer snap points:
 * - **Peek** (0.18): handle + search bar visible — quick search access
 * - **Half** (0.52): search + home clock + notifications visible
 * - **Full** (0.92): everything, including menu links
 *
 * Search modes toggle between forward (place name) and reverse (lat/lon).
 */

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { SITENAME } from "@/types/consts";
import {
  computeTrueSolarTime,
  type TrueSolarTimeResult,
} from "@/lib/astronomy";
import {
  formatDate,
  formatDuration,
  formatTime,
  gmtLabel,
  secsToMins,
} from "@/utils";
import { nowDate } from "@/lib/ntp";
import { useAppUI } from "@/app/(themes)/neue/contexts/app-ui-context";
import { useTimeFormat } from "@/app/(themes)/neue/contexts/time-format-context";
import { useGeocode } from "@/app/hooks/use-geocode";
import { cn } from "@/lib/utils";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/app/components/ui/drawer";
import { Input } from "@/app/components/ui/input";
import { Spinner } from "@/app/components/ui/spinner-2";
import {
  MapPinIcon,
  SearchIcon,
  ChevronUpIcon,
  ArrowLeftRightIcon,
  BellIcon,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Vaul snap points: peek → half → full */
const SNAP_POINTS = [0.25, 0.52, 0.92] as const;
type SnapPoint = (typeof SNAP_POINTS)[number];

// ---------------------------------------------------------------------------
// Hook — home TST ticker (shared with desktop header)
// ---------------------------------------------------------------------------

/**
 * Returns a live-ticking {@link TrueSolarTimeResult} for a fixed home longitude.
 * Ticks once per second via rAF; recomputes EoT every 60 s for accuracy.
 *
 * @param longitude - Observer's home longitude, or undefined before geolocation resolves.
 */
function useHomeTicker(longitude?: number): TrueSolarTimeResult | undefined {
  const [tst, setTST] = useState<TrueSolarTimeResult>();
  const rafRef = useRef<number | null>(null);
  const lastSecRef = useRef(-1);
  const anchorTSTMsRef = useRef(0);
  const anchorMSTMsRef = useRef(0);
  const anchorPerfMsRef = useRef(0);
  const lonRef = useRef(longitude);

  useEffect(() => {
    lonRef.current = longitude;
  }, [longitude]);

  useEffect(() => {
    if (longitude == null) return;

    const initial = computeTrueSolarTime(nowDate(), longitude);
    anchorTSTMsRef.current = initial.trueSolarTime.getTime();
    anchorMSTMsRef.current = initial.meanSolarTime.getTime();
    anchorPerfMsRef.current = performance.now();
    setTST(initial);

    function tick() {
      const elapsed = performance.now() - anchorPerfMsRef.current;
      const tst = anchorTSTMsRef.current + elapsed;
      const mst = anchorMSTMsRef.current + elapsed;
      const sec = Math.floor(tst / 1_000);

      if (sec !== lastSecRef.current) {
        lastSecRef.current = sec;
        if (sec % 60 === 0) {
          const fresh = computeTrueSolarTime(nowDate(), lonRef.current!);
          anchorTSTMsRef.current = fresh.trueSolarTime.getTime();
          anchorMSTMsRef.current = fresh.meanSolarTime.getTime();
          anchorPerfMsRef.current = performance.now();
          setTST(fresh);
        } else {
          setTST((prev) =>
            prev
              ? {
                  ...prev,
                  trueSolarTime: new Date(tst),
                  meanSolarTime: new Date(mst),
                }
              : prev,
          );
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [longitude]);

  return tst;
}

// ---------------------------------------------------------------------------
// Notification builder (mirrors desktop header logic)
// ---------------------------------------------------------------------------

/**
 * Computes the list of notification strings from current app state.
 * Kept as a pure function so it can be called in both the header strip
 * and the drawer without duplicating logic.
 */
function useNotifications(): string[] {
  const { active, activeRes, home, clockOffsetMs } = useAppUI();
  const homeTST = useHomeTicker(home?.longitude);
  const notifications: string[] = [];

  const isViewingHome =
    Math.abs((active?.longitude ?? 0) - (home?.longitude ?? 0)) < 0.01;

  if (!isViewingHome && homeTST && activeRes && active && !!home?.longitude) {
    const diffMin = activeRes.totalOffsetMinutes - homeTST.totalOffsetMinutes;
    const dir = diffMin > 0 ? "ahead of" : "behind";
    notifications.push(
      `${active.label.title} is ${formatDuration(Math.abs(diffMin), "minutes")} ${dir} ${home.label.title}`,
    );
  }

  if (activeRes && active?.time?.totalOffset != null) {
    const civilOffsetMin = secsToMins(active.time.totalOffset);
    const solarOffsetMin = activeRes.totalOffsetMinutes;
    const diffMin = civilOffsetMin - solarOffsetMin;
    if (Math.abs(diffMin) >= 0.5) {
      const dir = diffMin > 0 ? "ahead of" : "behind";
      notifications.push(
        `The local time in ${active.label.title} is ${formatDuration(Math.abs(diffMin), "minutes")} ${dir} solar time`,
      );
    }
  }

  if (!isViewingHome && homeTST && home?.time?.totalOffset != null) {
    const civilOffsetMin = secsToMins(home.time.totalOffset);
    const solarOffsetMin = homeTST.totalOffsetMinutes;
    const diffMin = civilOffsetMin - solarOffsetMin;
    if (Math.abs(diffMin) >= 0.5) {
      const dir = diffMin > 0 ? "ahead of" : "behind";
      notifications.push(
        `${home.label.title}'s local time is ${formatDuration(Math.abs(diffMin), "minutes")} ${dir} solar time`,
      );
    }
  }

  if (Math.abs(clockOffsetMs) > 1_000) {
    const dir = clockOffsetMs > 0 ? "ahead of" : "behind";
    notifications.push(
      `Your system clock is ${formatDuration(Math.abs(clockOffsetMs), "ms")} ${dir} network time`,
    );
  }

  return notifications;
}

// ---------------------------------------------------------------------------
// Mobile header strip
// ---------------------------------------------------------------------------

/**
 * Slim mobile header — site name, active location date, and drawer trigger.
 * The trigger label reflects the notification count so users know there's
 * something to read before opening.
 */
export function MobileHeader() {
  const { activeRes, isFocus } = useAppUI();
  const { solarMode } = useTimeFormat();
  const notifications = useNotifications();
  const [snap, setSnap] = useState<SnapPoint | number | string | null>(
    SNAP_POINTS[0],
  );
  const [open, setOpen] = useState(false);

  if (isFocus) return null;

  const activeDate = activeRes
    ? solarMode === "TST"
      ? activeRes.trueSolarTime
      : activeRes.meanSolarTime
    : nowDate();

  return (
    <header className="neue-grid pt-3 h-(--header-height) items-center">
      {/* Site name */}
      <Link href="/" className="col-span-2 tracking-tight">
        {SITENAME}
      </Link>

      {/* Date — centre span */}
      <div className="col-span-4 text-center tabular-nums opacity-80 text-xs">
        {formatDate(activeDate)}
      </div>

      {/* Drawer trigger */}
      <Drawer
        open={open}
        onOpenChange={setOpen}
        snapPoints={[...SNAP_POINTS]}
        activeSnapPoint={snap}
        setActiveSnapPoint={setSnap}
        direction="bottom"
        // modal={false}
      >
        <DrawerTrigger asChild>
          <button
            className="col-span-2 justify-self-end flex items-center gap-1 text-sm"
            aria-label="Open menu"
          >
            <span className="">
              [ search +{notifications.length > 0 && notifications.length}]
            </span>
          </button>
        </DrawerTrigger>

        {/* <MobilevHeader /> */}

        <MobilevHeader
          snap={snap}
          setSnap={setSnap}
          notifications={notifications}
          onClose={() => setOpen(false)}
        />
      </Drawer>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Drawer
// ---------------------------------------------------------------------------

interface MobileDrawerProps {
  snap: SnapPoint | number | string | null;
  setSnap: (s: SnapPoint | number | string) => void;
  notifications: string[];
  onClose: () => void;
}

/**
 * Bottom-sheet drawer with three snap points.
 *
 * Contents:
 * - Drag handle + search bar (always in view at peek snap)
 * - Home clock strip (visible at half snap)
 * - Notifications (visible at half snap)
 * - Menu links (visible at full snap)
 */
function MobileDrawer({
  snap,
  setSnap,
  notifications,
  onClose,
}: MobileDrawerProps) {
  const { home, setActive } = useAppUI();
  const { solarMode, hourFormat } = useTimeFormat();
  const homeTST = useHomeTicker(home?.longitude);

  const [searchMode, setSearchMode] = useState<"forward" | "reverse">(
    "forward",
  );
  const [query, setQuery] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");

  const { search, reverse, loading, error, reset } = useGeocode();

  const isAtLeastHalf = typeof snap === "number" && snap >= SNAP_POINTS[1];

  const isAtFull = typeof snap === "number" && snap >= SNAP_POINTS[2];

  // ── Solar home clock display values ────────────────────────────────────────
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1_000);
    return () => clearInterval(id);
  }, []);

  const solarDate = homeTST
    ? solarMode === "TST"
      ? homeTST.trueSolarTime
      : homeTST.meanSolarTime
    : null;

  const solarParts = solarDate ? formatTime(solarDate, 0, hourFormat) : null;
  const solarLabel = solarParts
    ? `${solarParts.hh} : ${solarParts.mm}${hourFormat === "12" ? ` ${solarParts.period}` : ""}`
    : "·· : ··";

  const ct = formatTime(nowDate(), home?.time?.totalOffset, hourFormat);
  const civilLabel = `${ct.hh} : ${ct.mm}${hourFormat === "12" ? ` ${ct.period}` : ""}`;
  const offsetLabel = gmtLabel(home?.time?.totalOffset ?? 0);

  // ── Search handlers ─────────────────────────────────────────────────────────

  async function handleForwardSearch() {
    if (!query.trim()) return;
    const result = await search(query.trim());
    if (result) {
      setActive(result);
      reset();
      setQuery("");
      onClose();
    }
  }

  async function handleReverseSearch() {
    const latN = parseFloat(lat);
    const lonN = parseFloat(lon);
    if (isNaN(latN) || isNaN(lonN)) return;
    const result = await reverse(latN, lonN);
    if (result) {
      setActive(result);
      reset();
      setLat("");
      setLon("");
      onClose();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    searchMode === "forward" ? handleForwardSearch() : handleReverseSearch();
  }

  // ── Toggle search mode ──────────────────────────────────────────────────────

  function toggleSearchMode() {
    setSearchMode((m) => (m === "forward" ? "reverse" : "forward"));
    reset();
    setQuery("");
    setLat("");
    setLon("");
  }

  return (
    <DrawerContent
      className={cn(" data-[vaul-drawer-direction=bottom]:max-h-[97%] ")}
    >
      <DrawerHeader className="border-b px-4 pt-2 items-end gap-2">
        {/* ── Drag handle ──────────────────────────────────────────────────── */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-foreground/20" />
        </div>

        <div className="grid grid-cols-[auto_1fr_auto] gap-1 content-center w-full">
          <Button variant={"link"} className=" p-0 hit-area-2">
            Close
          </Button>
          <DrawerTitle className="flex items-center justify-center">
            Search
          </DrawerTitle>
          <Button variant={"link"} disabled className="p-0 hit-area-2">
            {1 ? <Spinner size={14} /> : "Search"}
          </Button>
        </div>

        {/* ── Search section — always visible ──────────────────────────────── */}
        <div className="px-4 pt-2 pb-3 shrink-0 flex flex-col gap-2">
          {/* Mode toggle row */}
          <div className="flex items-center justify-between">
            <span className="text-xs opacity-50 tracking-widest uppercase">
              {searchMode === "forward" ? "Place" : "Coordinates"}
            </span>
            <button
              onClick={toggleSearchMode}
              className="flex items-center gap-1 text-xs opacity-60 hover:opacity-100 transition-opacity"
              aria-label="Toggle search mode"
            >
              <ArrowLeftRightIcon className="size-3" />
              {searchMode === "forward" ? "Use coordinates" : "Use place name"}
            </button>
          </div>

          {/* Forward search */}
          <div
            className={cn(
              "flex flex-col gap-2 transition-all duration-300 ease-in-out overflow-hidden",
              searchMode === "forward"
                ? "max-h-24 opacity-100"
                : "max-h-0 opacity-0 pointer-events-none",
            )}
          >
            <div className="relative flex items-center">
              <SearchIcon className="absolute left-3 size-3.5 opacity-40" />
              <input
                type="text"
                placeholder="Shibuya, Tokyo…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className={cn(
                  "w-full pl-9 pr-16 py-2.5 text-sm rounded-sm",
                  "bg-muted/60 border border-border/60",
                  "outline-none focus:border-foreground/30",
                  "placeholder:opacity-40 transition-colors",
                )}
              />
              <button
                onClick={handleForwardSearch}
                disabled={loading || !query.trim()}
                className={cn(
                  "absolute right-2 px-2 py-1 text-xs rounded-sm",
                  "bg-foreground text-background",
                  "disabled:opacity-30 transition-opacity",
                )}
              >
                {loading ? <Spinner size={12} /> : "Go"}
              </button>
            </div>
          </div>

          {/* Reverse search */}
          <div
            className={cn(
              "flex flex-col gap-2 transition-all duration-300 ease-in-out overflow-hidden",
              searchMode === "reverse"
                ? "max-h-40 opacity-100"
                : "max-h-0 opacity-0 pointer-events-none",
            )}
          >
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  {
                    id: "lat",
                    label: "Latitude",
                    value: lat,
                    set: setLat,
                    placeholder: "35.6768…",
                    min: -90,
                    max: 90,
                  },
                  {
                    id: "lon",
                    label: "Longitude",
                    value: lon,
                    set: setLon,
                    placeholder: "139.763…",
                    min: -180,
                    max: 180,
                  },
                ] as const
              ).map(({ id, label, value, set, placeholder, min, max }) => (
                <div key={id} className="flex flex-col gap-1">
                  <label htmlFor={id} className="text-xs opacity-50">
                    {label}
                  </label>
                  <input
                    id={id}
                    type="number"
                    min={min}
                    max={max}
                    step="any"
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className={cn(
                      "w-full px-3 py-2.5 text-sm rounded-sm tabular-nums",
                      "bg-muted/60 border border-border/60",
                      "outline-none focus:border-foreground/30",
                      "placeholder:opacity-40 transition-colors",
                      "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                    )}
                  />
                </div>
              ))}
            </div>
            <button
              onClick={handleReverseSearch}
              disabled={loading || !lat || !lon}
              className={cn(
                "w-full py-2.5 text-sm rounded-sm",
                "bg-foreground text-background",
                "disabled:opacity-30 transition-opacity flex items-center justify-center gap-2",
              )}
            >
              {loading ? (
                <Spinner size={12} />
              ) : (
                <>
                  <MapPinIcon className="size-3.5" />
                  Lookup coordinates
                </>
              )}
            </button>
          </div>

          {/* Error */}
          {error && <p className="text-xs opacity-60 text-center">{error}</p>}
        </div>
      </DrawerHeader>

      {/* ── Scrollable body — visible at half + full ──────────────────────── */}
      <div
        className={cn(
          "flex-1 overflow-y-auto no-scrollbar px-4 flex flex-col gap-5 pb-10",
          "transition-opacity duration-300",
          isAtLeastHalf ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      >
        {/* Home clock */}
        <section className="flex flex-col gap-1">
          <span className="text-xs opacity-40 tracking-widest uppercase">
            Home
          </span>
          <button
            onClick={() => home && setActive(home)}
            className="flex items-center justify-between py-3 px-4 rounded-sm bg-muted/40 border border-border/40 w-full text-left"
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">
                {home?.label.title ?? "—"}
              </span>
              <span className="text-xs opacity-50">
                {offsetLabel} · {civilLabel} civil
              </span>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span className="tabular-nums font-mono text-sm">
                {solarLabel}
              </span>
              <span className="text-xs opacity-40">{solarMode} solar</span>
            </div>
          </button>
        </section>

        {/* Notifications */}
        {notifications.length > 0 && (
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs opacity-40 tracking-widest uppercase">
                FYI
              </span>
              <span className="text-xs opacity-40">
                <BellIcon className="size-3 inline-block" />{" "}
                {notifications.length}
              </span>
            </div>
            <ul className="flex flex-col gap-1 rounded-sm border border-border/40 overflow-hidden">
              {notifications.map((msg, i) => (
                <li
                  key={i}
                  className={cn(
                    "grid grid-cols-[1.5rem_1fr] gap-2 px-4 py-3 text-sm",
                    i < notifications.length - 1 && "border-b border-border/30",
                  )}
                >
                  <span className="font-mono opacity-40 mt-px">[•]</span>
                  <span className="leading-snug">{msg}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Menu — only at full snap */}
        <section
          className={cn(
            "flex flex-col gap-2 transition-opacity duration-300",
            isAtFull ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
        >
          <span className="text-xs opacity-40 tracking-widest uppercase">
            Menu
          </span>
          <nav className="flex flex-col rounded-sm border border-border/40 overflow-hidden">
            {(
              [
                { label: "Map", href: "/map" },
                { label: "Options", href: "#" },
                { label: "About", href: "#" },
              ] as const
            ).map(({ label, href }, i, arr) => (
              <Link
                key={label}
                href={href}
                className={cn(
                  "grid grid-cols-[1.5rem_1fr] gap-2 px-4 py-3.5 text-sm",
                  "hover:bg-muted/40 transition-colors",
                  i < arr.length - 1 && "border-b border-border/30",
                )}
              >
                <span className="font-mono opacity-40">[→]</span>
                {label}
              </Link>
            ))}
          </nav>
        </section>
      </div>
    </DrawerContent>
  );
}

export function MobilevHeader({
  snap,
  setSnap,
  notifications,
  onClose,
}: MobileDrawerProps) {
  const { home, setActive } = useAppUI();
  const { solarMode, hourFormat } = useTimeFormat();
  const homeTST = useHomeTicker(home?.longitude);

  const [searchMode, setSearchMode] = useState<"forward" | "reverse">(
    "forward",
  );
  const [query, setQuery] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");

  const { search, reverse, loading, error, reset } = useGeocode();

  const isAtLeastHalf = typeof snap === "number" && snap >= SNAP_POINTS[1];

  const isAtFull = typeof snap === "number" && snap >= SNAP_POINTS[2];

  // ── Solar home clock display values ────────────────────────────────────────
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1_000);
    return () => clearInterval(id);
  }, []);

  const solarDate = homeTST
    ? solarMode === "TST"
      ? homeTST.trueSolarTime
      : homeTST.meanSolarTime
    : null;

  const solarParts = solarDate ? formatTime(solarDate, 0, hourFormat) : null;
  const solarLabel = solarParts
    ? `${solarParts.hh} : ${solarParts.mm}${hourFormat === "12" ? ` ${solarParts.period}` : ""}`
    : "·· : ··";

  const ct = formatTime(nowDate(), home?.time?.totalOffset, hourFormat);
  const civilLabel = `${ct.hh} : ${ct.mm}${hourFormat === "12" ? ` ${ct.period}` : ""}`;
  const offsetLabel = gmtLabel(home?.time?.totalOffset ?? 0);

  // ── Search handlers ─────────────────────────────────────────────────────────

  async function handleForwardSearch() {
    if (!query.trim()) return;
    const result = await search(query.trim());
    if (result) {
      setActive(result);
      reset();
      setQuery("");
      onClose();
    }
  }

  async function handleReverseSearch() {
    const latN = parseFloat(lat);
    const lonN = parseFloat(lon);
    if (isNaN(latN) || isNaN(lonN)) return;
    const result = await reverse(latN, lonN);
    if (result) {
      setActive(result);
      reset();
      setLat("");
      setLon("");
      onClose();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    searchMode === "forward" ? handleForwardSearch() : handleReverseSearch();
  }

  // ── Toggle search mode ──────────────────────────────────────────────────────

  function toggleSearchMode() {
    setSearchMode((m) => (m === "forward" ? "reverse" : "forward"));
    reset();
    setQuery("");
    setLat("");
    setLon("");
  }

  return (
    // <Drawer
    //   snapPoints={snapPoints}
    //   activeSnapPoint={snap}
    //   setActiveSnapPoint={setSnap}
    //   direction="bottom"
    // >
    //   <DrawerTrigger className="relative flex h-10 flex-shrink-0 items-center justify-center gap-2 overflow-hidden rounded-full bg-white px-4 text-sm font-medium shadow-sm transition-all hover:bg-[#FAFAFA] dark:bg-[#161615] dark:hover:bg-[#1A1A19] dark:text-white">
    //     Open Drawer
    //   </DrawerTrigger>
    <DrawerContent
      className="data-[vaul-drawer-direction=bottom]:max-h-[97%] data-[vaul-drawer-direction=bottom]:mt-[unset]"
      // className="fixed flex flex-col bg-white border border-gray-200 border-b-none rounded-t-[10px] bottom-0 left-0 right-0 h-full max-h-[97%] mx-[-1px]"
    >
      {" "}
      <DrawerHeader className="border-b px-4 pt-2 items-end gap-2">
        <div className="grid grid-cols-[auto_1fr_auto] gap-1 content-center w-full">
          <Button variant={"link"} className=" p-0 hit-area-2">
            Close
          </Button>
          <DrawerTitle className="flex items-center justify-center">
            Search
          </DrawerTitle>
          <Button variant={"link"} disabled className="p-0 hit-area-2">
            {1 ? <Spinner size={14} /> : "Search"}
          </Button>
        </div>

        {/* ── Search section — always visible ──────────────────────────────── */}
        <div className="px-4 pt-2 pb-3 shrink-0 flex flex-col gap-2">
          {/* Mode toggle row */}
          <div className="flex items-center justify-between">
            <span className="text-xs opacity-50 tracking-widest uppercase">
              {searchMode === "forward" ? "Place" : "Coordinates"}
            </span>
            <button
              onClick={toggleSearchMode}
              className="flex items-center gap-1 text-xs opacity-60 hover:opacity-100 transition-opacity"
              aria-label="Toggle search mode"
            >
              <ArrowLeftRightIcon className="size-3" />
              {searchMode === "forward" ? "Use coordinates" : "Use place name"}
            </button>
          </div>

          {/* Forward search */}
          <div
            className={cn(
              "flex flex-col gap-2 transition-all duration-300 ease-in-out overflow-hidden",
              searchMode === "forward"
                ? "max-h-24 opacity-100"
                : "max-h-0 opacity-0 pointer-events-none",
            )}
          >
            <div className="relative flex items-center">
              <SearchIcon className="absolute left-3 size-3.5 opacity-40" />
              <input
                type="text"
                placeholder="Shibuya, Tokyo…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className={cn(
                  "w-full pl-9 pr-16 py-2.5 text-sm rounded-sm",
                  "bg-muted/60 border border-border/60",
                  "outline-none focus:border-foreground/30",
                  "placeholder:opacity-40 transition-colors",
                )}
              />
              <button
                onClick={handleForwardSearch}
                disabled={loading || !query.trim()}
                className={cn(
                  "absolute right-2 px-2 py-1 text-xs rounded-sm",
                  "bg-foreground text-background",
                  "disabled:opacity-30 transition-opacity",
                )}
              >
                {loading ? <Spinner size={12} /> : "Go"}
              </button>
            </div>
          </div>

          {/* Reverse search */}
          <div
            className={cn(
              "flex flex-col gap-2 transition-all duration-300 ease-in-out overflow-hidden",
              searchMode === "reverse"
                ? "max-h-40 opacity-100"
                : "max-h-0 opacity-0 pointer-events-none",
            )}
          >
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  {
                    id: "lat",
                    label: "Latitude",
                    value: lat,
                    set: setLat,
                    placeholder: "35.6768…",
                    min: -90,
                    max: 90,
                  },
                  {
                    id: "lon",
                    label: "Longitude",
                    value: lon,
                    set: setLon,
                    placeholder: "139.763…",
                    min: -180,
                    max: 180,
                  },
                ] as const
              ).map(({ id, label, value, set, placeholder, min, max }) => (
                <div key={id} className="flex flex-col gap-1">
                  <label htmlFor={id} className="text-xs opacity-50">
                    {label}
                  </label>
                  <input
                    id={id}
                    type="number"
                    min={min}
                    max={max}
                    step="any"
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className={cn(
                      "w-full px-3 py-2.5 text-sm rounded-sm tabular-nums",
                      "bg-muted/60 border border-border/60",
                      "outline-none focus:border-foreground/30",
                      "placeholder:opacity-40 transition-colors",
                      "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                    )}
                  />
                </div>
              ))}
            </div>
            <button
              onClick={handleReverseSearch}
              disabled={loading || !lat || !lon}
              className={cn(
                "w-full py-2.5 text-sm rounded-sm",
                "bg-foreground text-background",
                "disabled:opacity-30 transition-opacity flex items-center justify-center gap-2",
              )}
            >
              {loading ? (
                <Spinner size={12} />
              ) : (
                <>
                  <MapPinIcon className="size-3.5" />
                  Lookup coordinates
                </>
              )}
            </button>
          </div>

          {/* Error */}
          {error && <p className="text-xs opacity-60 text-center">{error}</p>}
        </div>
      </DrawerHeader>
      <div
        className={cn("flex flex-col max-w-md mx-auto w-full p-4 pt-5", {
          "overflow-y-auto": snap === 1,
          "overflow-hidden": snap !== 1,
        })}
      >
        <p className="text-sm mt-1 text-gray-600 mb-6">
          40 videos, 20+ exercises
        </p>
        <p className="text-gray-600">
          The world of user interface design is an intricate landscape filled
          with hidden details and nuance. In this course, you will learn
          something cool. To the untrained eye, a beautifully designed UI.
        </p>
        <button className="bg-black text-gray-50 mt-8 rounded-md h-[48px] flex-shrink-0 font-medium">
          Buy for $199
        </button>
        <div className="mt-12">
          <h2 className="text-xl font-medium text-gray-900">
            Module 01. The Details
          </h2>
          <div className="space-y-4 mt-4">
            <div>
              <span className="block text-gray-900">Layers of UI</span>
              <span className="text-gray-600">
                A basic introduction to Layers of Design.
              </span>
            </div>
            <div>
              <span className="block text-gray-900">Typography</span>
              <span className="text-gray-600">The fundamentals of type.</span>
            </div>
            <div>
              <span className="block text-gray-900">UI Animations</span>
              <span className="text-gray-600">
                Going through the right easings and durations.
              </span>
            </div>
          </div>
        </div>
        <div className="mt-12">
          <figure>
            <blockquote className="font-serif text-gray-900">
              “I especially loved the hidden details video. That was so useful,
              learned a lot by just reading it. Can&rsquo;t wait for more course
              content!”
            </blockquote>
            <figcaption>
              <span className="text-sm text-gray-600 mt-2 block">
                Yvonne Ray, Frontend Developer
              </span>
            </figcaption>
          </figure>
        </div>
        <div className="mt-12">
          <h2 className="text-xl font-medium text-gray-900">
            Module 02. The Process
          </h2>
          <div className="space-y-4 mt-4">
            <div>
              <span className="block text-gray-900">Build</span>
              <span className="text-gray-600">
                Create cool components to practice.
              </span>
            </div>
            <div>
              <span className="block text-gray-900">User Insight</span>
              <span className="text-gray-600">
                Find out what users think and fine-tune.
              </span>
            </div>
            <div>
              <span className="block text-gray-900">
                Putting it all together
              </span>
              <span className="text-gray-600">
                Let&apos;s build an app together and apply everything.
              </span>
            </div>
          </div>
        </div>
      </div>
    </DrawerContent>
    // </Drawer>
  );
}
