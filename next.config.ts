import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Upload da foto de perfil (já redimensionada no cliente) passa por Server Action.
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
