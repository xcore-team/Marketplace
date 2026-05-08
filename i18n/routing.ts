import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

export const routing = defineRouting({
  locales: ['en', 'fr'],
  defaultLocale: 'en',
  pathnames: {
    '/': '/',
    '/plugins': {
      en: '/plugins',
      fr: '/plugins'
    },
    '/plugins/[slug]': {
      en: '/plugins/[slug]',
      fr: '/plugins/[slug]'
    }
  }
});

export type Pathnames = keyof typeof routing.pathnames;
export type Locale = (typeof routing.locales)[number];

export const { Link, redirect, usePathname, useRouter } =
  createNavigation(routing);
