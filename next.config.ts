import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // ffmpeg-static / ffprobe-static resolve their binary path via __dirname,
  // which breaks once Next.js bundles them — keep them on native require.
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static"],
};

export default withNextIntl(nextConfig);
