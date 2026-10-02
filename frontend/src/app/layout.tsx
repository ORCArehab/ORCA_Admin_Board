import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ORCA Admin", template: "%s · ORCA Admin" },
  description: "Internal ORCA Rehab operations dashboard",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
