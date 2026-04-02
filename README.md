# 真太陽時 — しんたいようじ

**True Solar Time, for wherever you are.**

A web app that shows what time it *actually* is — based on where the sun sits in the sky at your longitude, not what some committee decided in 1884.

→ **[Live demo](https://true-time.vercel.app)**

---

## What is this?

Your civil clock says 12:00. But solar noon — the moment the sun is highest in the sky — might actually be at 10:47, or 13:22, depending on where you live. That gap is real, and in some places it's enormous.

This app shows:

- **True Solar Time (TST)** — raw sun position, longitude-corrected plus the Equation of Time
- **Mean Solar Time (MST)** — longitude-corrected only, without the wobble
- Sun position, phase, altitude and azimuth
- Twilight times, golden hour, solar noon
- Moon phase, rise/set, distance
- Live weather conditions
- An interactive globe for picking any location

---

## Stack

| Layer         | Tech                                                 |
| ------------- | ---------------------------------------------------- |
| Framework     | Next.js 15 (App Router)                              |
| Styling       | Tailwind CSS v4                                      |
| UI components | shadcn/ui                                            |
| Map           | MapLibre GL + MapTiler                               |
| Geocoding     | Nominatim / OpenStreetMap                            |
| Timezone      | TimeAPI + TimeZoneDB (fallback)                      |
| Weather       | Open-Meteo                                           |
| Astronomy     | Custom engine — Meeus + NOAA SPA (zero runtime deps) |

---

## Architecture

```
app/
├── (themes)/
│   └── neue/               ← default theme
│       ├── components/     ← header, footer, drawers, map
│       ├── contexts/        ← app state, time format
│       ├── hooks/           ← useActiveUrlSync
│       └── page.tsx         ← main solar time page
├── hooks/                  ← shared: useSolarTicker, useWeather, useSkyGradient…
├── components/ui/          ← shadcn primitives
lib/
├── astronomy.ts            ← TST, sun/moon position, solar events (NOAA/Meeus)
├── geocoding.ts            ← Nominatim wrapper
├── weather.ts              ← Open-Meteo client
├── timezone.ts             ← TimeAPI + TimeZoneDB client
└── ntp.ts                  ← HTTP clock sync
server/
├── geocode.ts              ← server action (rate limit + LRU cache)
├── weather.ts              ← server action (token bucket + LRU cache)
└── timezone.ts             ← server action proxy
```

The astronomy engine (`lib/astronomy.ts`) has zero runtime dependencies. All formulas are derived from Jean Meeus *Astronomical Algorithms* (2nd ed.) and the NOAA Solar Position Algorithm. Solar position accuracy is ±0.01°; solar event timing is ±30 s.

---

## Themes

The core (`lib/`, `hooks/`, `server/`) is shared. UI lives in `app/(themes)/<name>/`. Anyone can build a theme on top of the same data pipeline without touching the engine.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how themes work.

---

## Running locally

```bash
git clone https://github.com/thierryntoh24/shintaiyouji
cd shintaiyouji
pnpm install
```

Create `.env.local`:

```env
NEXT_PUBLIC_MAPTILER_KEY=your_maptiler_key
NEXT_PUBLIC_TIMEZONEDB_KEY=your_timezonedb_key   # optional fallback
```

```bash
pnpm dev
```

MapTiler has a generous free tier. TimeZoneDB is only hit if TimeAPI is down, so the key is optional.

---

## Accuracy & limitations

- Solar events (sunrise/sunset) are accurate to **±30 seconds** for most latitudes.
- Near the poles, events like civil dawn may not occur — the app returns `null` gracefully.
- The Equation of Time correction ranges from **−16 to +14 minutes** across the year; this is expected, not a bug.
- Geocoding uses Nominatim (OpenStreetMap). Ocean coordinates or remote areas may return a fictional placeholder name (they're anime locations — this is intentional).
- Clock sync uses HTTP round-trip estimation (NTP-style). Accuracy is **±50–200 ms**, sufficient to detect significant drift but not a stratum-1 replacement.

---

## License

MIT — see [LICENSE](./LICENSE).

© 2026 Thierry Ntoh
