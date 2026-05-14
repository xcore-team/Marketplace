import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Admin — XCore Market", template: "%s — XCore Market Admin" },
  description: "XCore Market internal administration panel",
  robots: { index: false, follow: false },
  icons: {
    icon:      [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    shortcut:  '/favicon.svg',
    apple:     '/favicon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <meta name="robots" content="noindex, nofollow" />
      </head>
      <body>{children}</body>
    </html>
  );
}
