import { getTheme } from "@/utils/get-theme";

export default function Page() {
  const theme = getTheme();

  const Layout = theme.components.Layout;
  const Map = theme.components.Map;

  return (
    <Layout>
      <Map />
    </Layout>
  );
}
