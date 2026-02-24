import type { NextConfig } from "next";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";

function getBuildId(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  }
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "dev";
  }
}

function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf-8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_ID: getBuildId(),
    NEXT_PUBLIC_VERSION: getVersion(),
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://www.e-deck.nl",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
