'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/routing'
import { Github } from 'lucide-react'

export function Footer() {
  const t = useTranslations()

  return (
    <footer className="border-t border-xcore-border bg-xcore-card">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-8 h-8">
                <svg viewBox="0 0 484 315" className="w-full h-full">
                  <path
                    d="M348.518 223.66L307.798 264.31C302.482 269.617 296.172 273.825 289.229 276.694C282.286 279.563 274.847 281.036 267.334 281.029L209.798 280.98C194.627 280.967 180.082 274.927 169.363 264.19L128.714 223.471C117.995 212.734 111.981 198.178 111.994 183.007L112.044 125.471C112.05 117.958 113.536 110.521 116.417 103.583C119.298 96.6454 123.517 90.3429 128.833 85.0356L169.553 44.3864C180.29 33.6678 194.845 27.6534 210.017 27.6665L267.553 27.7162C275.065 27.7226 282.502 29.2087 289.44 32.0895C296.378 34.9702 302.681 39.1893 307.988 44.5058L348.637 85.2251C359.356 95.9623 365.37 110.518 365.357 125.689L365.307 183.225C365.294 198.397 359.255 212.942 348.518 223.66Z"
                    fill="#00C896"
                    stroke="black"
                    strokeWidth="6"
                  />
                </svg>
              </div>
              <span className="text-lg font-bold font-syne">XCore</span>
            </div>
            <p className="text-sm text-xcore-muted max-w-md">
              {t('footer.tagline')}
            </p>
          </div>

          {/* Links */}
          <div>
            <h3 className="font-semibold mb-4">Resources</h3>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/docs"
                  className="text-sm text-xcore-muted hover:text-xcore-text transition-colors"
                >
                  {t('footer.docs')}
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/xcore"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-xcore-muted hover:text-xcore-text transition-colors inline-flex items-center gap-2"
                >
                  {t('footer.github')}
                  <Github className="h-3 w-3" />
                </a>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold mb-4">{t('footer.contact')}</h3>
            <ul className="space-y-2">
              <li>
                <a
                  href="mailto:y4nn.dev@gmail.com"
                  className="text-sm text-xcore-muted hover:text-xcore-text transition-colors"
                >
                  y4nn.dev@gmail.com
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-12 pt-8 border-t border-xcore-border">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-xcore-muted">
              © {new Date().getFullYear()} XCore. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <Link
                href="/privacy"
                className="text-sm text-xcore-muted hover:text-xcore-text transition-colors"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="text-sm text-xcore-muted hover:text-xcore-text transition-colors"
              >
                Terms
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
