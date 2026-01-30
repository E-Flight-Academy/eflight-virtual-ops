import type { NextConfig } from "next";
import { execSync } from "child_process";

function getBuildId(): string {
  // Vercel provides this automatically
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  }
  // Local dev: read from git
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "dev";
  }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_ID: getBuildId(),
  },
};

export default nextConfig;
