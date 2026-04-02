# Contributing to 真の時間

Thanks for being here. This is a small fun project and contributions should feel the same way — low friction, no bureaucracy.

---

## How it's structured

The codebase has two distinct layers with different rules:

**Core** (`lib/`, `hooks/`, `server/`, `types/`) — the engine. Astronomy calculations, geocoding, weather fetching, clock sync, shared hooks. This is what all themes build on. Changes here affect everyone, so they get slightly more scrutiny.

**Themes** (`app/(themes)/<name>/`) — the presentation. Each theme is a self-contained UI that consumes the core and renders however it wants. Themes are where most creative contribution happens, and they're deliberately fenced off from each other.

---

## What you can contribute

### A new theme

The most open-ended contribution. Pick an aesthetic, name it, build it.

A theme needs:
```
app/(themes)/<your-theme-name>/
├── components/          ← your UI components
├── contexts/            ← extend or wrap app-ui-context if needed
├── hooks/               ← theme-specific hooks (optional)
├── page.tsx             ← main page
├── layout.tsx           ← wraps your page, sets data-theme attr
├── map.tsx              ← map page (optional but encouraged)
└── theme.ts             ← registers the theme
```

Register it in `utils/theme-registry.ts`:
```ts
import { yourTheme } from "@/app/(themes)/your-theme-name/theme";

export const themes = {
  default: neue,
  neue: neue,
  "your-theme-name": yourTheme,   // ← add this
};
```

Your theme gets access to everything in `app/hooks/` and `lib/` — the solar ticker, sky gradient, notifications, weather, geocoding, all of it. You don't reimplement any of that; you just build the face.

There are no design constraints. The existing *neue* theme is minimal and typographic. Yours could be a retro terminal, a data dashboard, a full-bleed sky illustration — whatever makes sense to you.

### Improvements to an existing theme

Open a PR against the theme's directory. If it's *neue*, I (Thierry) will review it. If it's a community theme, the theme author is the reviewer.

Small things that are always welcome: accessibility fixes, mobile layout improvements, animation polish, dark mode gaps.

### Core contributions

Bug fixes are always welcome with a clear reproduction. New features in the core (new astronomy data, new geocoding behaviour, etc.) are worth opening an issue for first — just so we can talk about whether it belongs in the engine or in a theme hook.

The astronomy engine (`lib/astronomy.ts`) is self-contained and well-documented. If you find a calculation error, cite the relevant Meeus chapter or NOAA reference in the PR and it'll get merged fast.

---

## Ground rules

- **No runtime dependencies in `lib/astronomy.ts`.** The whole point is zero-dep calculations.
- **Server actions stay server-only.** Don't import from `server/` in client components.
- **Themes don't bleed into each other.** If you need something shared, it belongs in `app/hooks/` or `lib/`, not in another theme's directory.
- **Rate limits are there for a reason.** Nominatim is a free public service. Don't remove or loosen the rate limiting in `server/geocode.ts`.

---

## Some notes

- **Add fonts to the general `fonts.ts`.** Theme specific fonts wont apply on portaled UI (e.g. vaul's drawer). The downside here is that unused fonts get loaded as well.

---

## Pull request checklist

- [ ] `pnpm build` passes with no type errors
- [ ] Tested on mobile viewport
- [ ] If touching the astronomy engine, include the formula source in the commit message
- [ ] If adding a new theme, add an entry to `CONTRIBUTORS.md`

---

## Getting started

```bash
git clone https://github.com/thierryntoh24/shintaiyouji
cd shintaiyouji
pnpm install
pnpm dev
```

That's it. No special setup beyond the env keys in the README.

---

## Questions

Open a GitHub Discussion or ping [@thierryntoh23](https://x.com/thierryntoh23) on Twitter.
