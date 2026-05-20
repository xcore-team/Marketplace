import type { Metadata } from "next"
import { ThemeProvider } from "next-themes"
import Navbar from "@/components/layout/Navbar"
import "./globals.css"

export const metadata: Metadata = {
  title: "Marketplace",
  description: "Marketplace platform",
  icons: {
    icon: "/mascot.svg",
  },
}

interface RootLayoutProps {
  children: React.ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      
      <body>
        <ThemeProvider
          attribute="data-theme"

          defaultTheme="system"

          enableSystem

          disableTransitionOnChange={false}
        >
          <Navbar />

          <div className="pt-14">
            {children}
          </div>

        </ThemeProvider>
      </body>
    </html>
  )
}