import { neue } from "@/app/(themes)/neue/theme";

export const themes = {
  default: neue,
  neue: neue,
} satisfies Record<Themes, Theme>;

export function getTheme(name: Themes = "default") {
  return themes[name] ?? themes.default;
}
