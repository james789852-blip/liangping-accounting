import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 針對 barrel 套件做按需引用，縮小 client bundle 並加快 dev 編譯。
  // lucide-react 被 80+ 檔案引用，最有感。
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "recharts",
      "@tanstack/react-table",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
    ],
  },
  // 正式環境壓縮回應（預設已開，明示以免被誤關）
  compress: true,
  // 不輸出 x-powered-by 標頭
  poweredByHeader: false,
};

export default nextConfig;
