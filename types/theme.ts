export enum Themes {
  default = "default",
  neue = "neue",
}

// each theme implements its layout, home and about
export type Theme = {
  name: Themes;
  author: string;
  version: string;
  components: {
    Layout: React.ComponentType<{ children: React.ReactNode }>;
    Context: React.ComponentType<{ children: React.ReactNode }>;
    Home: React.ComponentType;
    Map: React.ComponentType;
    About: React.ComponentType;
  };
};
