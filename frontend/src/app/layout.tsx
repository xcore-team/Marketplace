import type { Metadata } from "next"
import { ThemeProvider } from "next-themes"
import { Syne, JetBrains_Mono } from "next/font/google"
import Navbar from "@/components/layout/Navbar"
import "./globals.css"

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  display: "swap",
})

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jb-mono",
  display: "swap",
  weight: ["400", "500", "600"],
})

export const metadata: Metadata = {
  title: "XCore Hub — Plugin Registry",
  description: "The official registry for XCore framework plugins. Every submission passes a 9-gate security pipeline.",
  icons: {
    icon: "/icon.svg",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${syne.variable} ${mono.variable}`}>
      <body>
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange={false}
        >
          <Navbar />
          <div className="min-h-[calc(100dvh-3.5rem)] pt-14">
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
