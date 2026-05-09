import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TF Trading | 日経225",
  description: "日経225 自動売買ダッシュボード",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
