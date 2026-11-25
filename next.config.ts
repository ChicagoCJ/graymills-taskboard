import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [{
      source: "/",
      has: [{ type: "host", value: "graymills-taskboard-git-c2f63b-craig-shields-projects-275f9da6\\.vercel\\.app" }],
      destination: "https://graymills-taskboard.vercel.app/",
      permanent: false,
    }];
  },
};

export default nextConfig;
