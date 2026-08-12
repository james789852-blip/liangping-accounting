import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/meeting-report/*/pdf": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
      "./node_modules/@fontsource-variable/noto-sans-tc/files/**/*",
      "./node_modules/@fontsource-variable/noto-sans-tc/index.css",
    ],
  },
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
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
