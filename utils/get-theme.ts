import { Themes } from "@/types/theme";
import { themes } from "./theme-registry";

export function getTheme(name: Themes = Themes.default) {
  // save selected theme as cookie
  return themes[name] ?? themes.default;
}
