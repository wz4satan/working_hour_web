import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "工时记录 · Working Hour",
  description: "在 iPhone 本地记录上下工时间、周薪和实际到账金额，支持 Excel 周报与完整备份。",
  manifest: "/manifest.webmanifest",
  applicationName: "工时记录",
  appleWebApp: { capable: true, title: "工时记录", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#142c35" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
