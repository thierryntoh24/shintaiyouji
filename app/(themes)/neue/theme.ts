import { Theme, Themes } from "@/types/theme";
import Layout from "@/app/(themes)/neue/layout";
import Home from "@/app/(themes)/neue/page";
import About from "@/app/(themes)/neue/about";
import Map from "@/app/(themes)/neue/map";
import Context from "@/app/(themes)/neue/contexts";

export const neue: Theme = {
  name: Themes.neue,
  components: { Home, About, Layout, Map, Context },
  author: "Thierry Ntoh",
  version: "0.1",
};
