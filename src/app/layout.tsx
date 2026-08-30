import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "CLIMB - PROJECT 10K",
  description: "PROJECT 10K recording / post diagnosis / AI chat tool",
};

const NAV = [
  { href: "/", label: "ホーム" },
  { href: "/compose", label: "投稿を書く" },
  { href: "/chat", label: "AIチャット" },
  { href: "/posts", label: "投稿一覧" },
  { href: "/followers", label: "フォロワー" },
  { href: "/weekly", label: "週次" },
  { href: "/settings", label: "設定" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <nav className="topnav">
          <span className="brand">CLIMB</span>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="navlink">
              {n.label}
            </Link>
          ))}
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
