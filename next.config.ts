import type { NextConfig } from "next";

/**
 * Limits Node.js memory usage for dev server.
 * Helps prevent system-wide RAM exhaustion.
 */
const NODE_OPTIONS = "--max-old-space-size=512";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
