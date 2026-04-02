import { ImageResponse } from "next/og";

/**
 * Generates the default Open Graph image.
 * Used for link previews across the site.
 */
export async function GET(): Promise<ImageResponse> {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        background: "linear-gradient(135deg, #0f172a, #1e293b, #334155)",
        color: "white",
        fontSize: 64,
        fontWeight: 600,
        letterSpacing: "-0.02em",
      }}
    >
      <div style={{ fontSize: 80, marginBottom: 20 }}>真太陽時</div>

      <div style={{ fontSize: 32, opacity: 0.8 }}>True Solar Time</div>

      <div
        style={{
          marginTop: 40,
          fontSize: 24,
          opacity: 0.6,
        }}
      >
        Time based on the sun, not borders
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
    },
  );
}
