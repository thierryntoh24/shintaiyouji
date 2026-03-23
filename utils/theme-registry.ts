import { Theme, Themes } from "@/types/theme";
import { neue } from "@/app/(themes)/neue/theme";

export const themes = {
  default: neue,
  neue: neue,
} satisfies Record<Themes, Theme>;
