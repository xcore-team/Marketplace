import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'
import { Syne } from 'next/font/google'
import { Geist, Geist_Mono } from 'next/font/google'
import '../globals.css'

const syne = Syne({
  variable: '--font-syne',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
})

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export const metadata = {
  title: 'XCore Market - Plugin Marketplace',
  description: 'Browse, install, and publish plugins for the XCore framework. Every plugin is security-validated, dependency-checked, and production-ready.',
  icons: {
    icon: '/favicon.svg',
  },
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  // Await params in Next.js 16+
  const { locale } = await params

  // Ensure that the incoming `locale` is valid
  if (!routing.locales.includes(locale as any)) {
    notFound()
  }

  // Providing all messages to the client
  const messages = await getMessages()

  return (
    <html
      lang={locale}
      className={`${syne.variable} ${geistSans.variable} ${geistMono.variable} dark`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-xcore-bg text-xcore-text font-geist antialiased">
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
