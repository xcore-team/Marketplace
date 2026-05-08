'use client'

import { useTranslations } from 'next-intl'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Hero } from '@/components/sections/Hero'
import { PluginGrid } from '@/components/plugins/PluginGrid'

export default function ExplorerPage() {
  return (
    <>
      {/* Header */}
      <Header />

      {/* Main Content */}
      <main className="flex-1">
        {/* Hero Section */}
        <Hero />

        {/* Plugin Grid */}
        <section className="container mx-auto px-4 py-12">
          <PluginGrid />
        </section>
      </main>

      {/* Footer */}
      <Footer />
    </>
  )
}
