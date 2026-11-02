import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  // No development badge over the workspace; compile and runtime errors still show.
  devIndicators: false,
  // Sample sets never change in place: a new set goes in a new versioned folder (sounds/v2).
  headers: async () => [
    {
      source: "/sounds/v1/:path*",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    },
  ],
  // The pitch model's native runtime (a .so beside the .node binding) and its model file are
  // loaded at run time, so tracing the imports would miss them in a serverless deploy.
  outputFileTracingIncludes: {
    "/api/assistant/voice": [
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/x64/*",
      "./modules/voice/infrastructure/models/swift-f0.onnx",
    ],
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "globals.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
