'use client'

import { useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Link, usePathname } from '@/i18n/routing'
import { Menu, X, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Header() {
  const t = useTranslations()
  const locale = useLocale()
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const navigation = [
    { name: t('nav.plugins'), href: '/plugins' },
    { name: t('nav.categories'), href: '/categories' },
    { name: t('nav.docs'), href: '/docs' },
  ]

  return (
    <header className="sticky top-0 z-40 w-full border-b border-xcore-border bg-xcore-bg/95 backdrop-blur supports-[backdrop-filter]:bg-xcore-bg/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-3 flex-shrink-0">
            <div className="relative w-10 h-10">
              <svg viewBox="0 0 484 315" className="w-full h-full">
                <path
                  d="M348.518 223.66L307.798 264.31C302.482 269.617 296.172 273.825 289.229 276.694C282.286 279.563 274.847 281.036 267.334 281.029L209.798 280.98C194.627 280.967 180.082 274.927 169.363 264.19L128.714 223.471C117.995 212.734 111.981 198.178 111.994 183.007L112.044 125.471C112.05 117.958 113.536 110.521 116.417 103.583C119.298 96.6454 123.517 90.3429 128.833 85.0356L169.553 44.3864C180.29 33.6678 194.845 27.6534 210.017 27.6665L267.553 27.7162C275.065 27.7226 282.502 29.2087 289.44 32.0895C296.378 34.9702 302.681 39.1893 307.988 44.5058L348.637 85.2251C359.356 95.9623 365.37 110.518 365.357 125.689L365.307 183.225C365.294 198.397 359.255 212.942 348.518 223.66Z"
                  fill="#00C896"
                  stroke="black"
                  strokeWidth="6"
                />
              </svg>
            </div>
            <span className="text-xl font-bold font-syne">XCore</span>
          </Link>

          {/* Desktop Navigation - Center */}
          <nav className="hidden md:flex items-center space-x-8 flex-1 justify-center">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="text-sm font-medium text-xcore-muted hover:text-xcore-text transition-colors"
              >
                {item.name}
              </Link>
            ))}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Auth Buttons - Desktop */}
            <Link href="/login" className="hidden md:block">
              <Button variant="ghost" size="sm" className="text-xcore-muted hover:text-xcore-text">
                {t('auth.login')}
              </Button>
            </Link>
            <Link href="/register" className="hidden md:block">
              <Button size="sm" className="bg-xcore-green hover:bg-xcore-green/90 text-black font-medium">
                {t('auth.signUp')}
              </Button>
            </Link>

            {/* Language Switcher */}
            <Link
              href={pathname}
              locale={locale === 'en' ? 'fr' : 'en'}
              className="hidden md:flex items-center space-x-2 text-sm text-xcore-muted hover:text-xcore-text transition-colors"
            >
              <Globe className="h-4 w-4" />
              <span className="uppercase">{locale === 'en' ? 'FR' : 'EN'}</span>
            </Link>

            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-xcore-border">
            <nav className="flex flex-col space-y-3">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className="text-sm font-medium text-xcore-muted hover:text-xcore-text transition-colors py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.name}
                </Link>
              ))}

              {/* Mobile Language Switcher */}
              <Link
                href={pathname}
                locale={locale === 'en' ? 'fr' : 'en'}
                className="flex items-center space-x-2 text-sm text-xcore-muted hover:text-xcore-text transition-colors py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Globe className="h-4 w-4" />
                <span>{locale === 'en' ? 'Français' : 'English'}</span>
              </Link>

              {/* Mobile Auth Buttons */}
              <div className="flex flex-col space-y-2 pt-3 border-t border-xcore-border">
                <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="ghost" size="sm" className="w-full">
                    {t('auth.login')}
                  </Button>
                </Link>
                <Link href="/register" onClick={() => setMobileMenuOpen(false)}>
                  <Button size="sm" className="w-full bg-xcore-green hover:bg-xcore-green/90 text-black font-medium">
                    {t('auth.signUp')}
                  </Button>
                </Link>
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  )
}
