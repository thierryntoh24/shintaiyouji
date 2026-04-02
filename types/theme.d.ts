type Themes = "default" | "neue"; // add here

// each theme implements its layout, home and optionally, map
type Theme = {
  name: Themes;
  author: string;
  version: string;
  components: {
    Layout: React.ComponentType<{ children: React.ReactNode }>;
    Home: React.ComponentType;
    Map?: React.ComponentType;
  };
};
