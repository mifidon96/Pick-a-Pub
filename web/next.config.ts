import type { NextConfig } from "next";

// Static export: `npm run build` writes plain HTML/CSS/JS to ./out,
// which is what gets uploaded to S3 and served by CloudFront.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
