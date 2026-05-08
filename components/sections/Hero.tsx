'use client'

import { Search, Shield, Package, Zap } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'
import { HexIdle } from '@/components/mascotte'

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-xcore-border">
      {/* Simple Grid Background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1C1C1E_1px,transparent_1px),linear-gradient(to_bottom,#1C1C1E_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-30" />
      </div>

      <div className="container mx-auto px-4 py-24 md:py-32">
        <div className="max-w-4xl mx-auto">
          {/* Badge */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-xcore-border bg-xcore-card text-sm text-xcore-muted">
              <div className="w-1.5 h-1.5 rounded-full bg-xcore-green animate-pulse" />
              Official XCore Plugin Registry
            </div>
          </div>

          {/* Title with Mascotte Animation */}
          <div className="text-center mb-6">
            <h1 className="text-5xl md:text-7xl font-bold leading-tight tracking-tight">
              Discover Plugins for
              <br />
              <span className="relative inline-block">
                <span className="relative inline-block mx-3">
                  {/* Mascotte officielle qui tombe sur XCore */}
                  <motion.div
                    className="absolute -top-20 left-1/2 -translate-x-1/2 w-16 h-16 z-10"
                    initial={{ y: -150, opacity: 0, rotate: -10 }}
                    animate={{ y: 0, opacity: 1, rotate: 0 }}
                    transition={{
                      type: "spring",
                      stiffness: 80,
                      damping: 12,
                      delay: 0.3,
                    }}
                  >
                    <HexIdle size="sm" animated={true} />
                  </motion.div>
                  <span className="text-xcore-green">XCore</span>
                </span>
              </span>
            </h1>
          </div>

          {/* Subtitle - Copywriting marketplace */}
          <p className="text-lg text-xcore-muted text-center mb-12 max-w-2xl mx-auto">
            Browse, install, and publish plugins for the XCore framework. Every plugin is security-validated, dependency-checked, and production-ready.
          </p>

          {/* Search Bar */}
          <div className="max-w-2xl mx-auto mb-16">
            <div className="relative flex items-center border border-xcore-border rounded-lg bg-xcore-card hover:border-xcore-green/50 transition-colors">
              <Search className="absolute left-4 h-5 w-5 text-xcore-muted" />
              <Input
                type="search"
                placeholder="Search plugins by name, category, or capability..."
                className="flex-1 pl-12 pr-4 py-6 bg-transparent border-0 text-base placeholder:text-xcore-muted focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <Button
                size="lg"
                className="m-1.5 bg-xcore-green hover:bg-xcore-green/90 text-black font-semibold px-6"
              >
                Search
              </Button>
            </div>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                icon: Shield,
                title: 'Security-Validated',
                description: 'Automated security gates before publication',
              },
              {
                icon: Package,
                title: 'Dependency-Checked',
                description: 'Conflict detection and version compatibility',
              },
              {
                icon: Zap,
                title: 'Production-Ready',
                description: 'Tested and optimized for real workloads',
              },
            ].map((feature, i) => (
              <div
                key={i}
                className="p-4 rounded-lg border border-xcore-border bg-xcore-card hover:border-xcore-green/50 transition-colors"
              >
                <feature.icon className="w-6 h-6 text-xcore-green mb-3" />
                <h3 className="font-semibold mb-1">{feature.title}</h3>
                <p className="text-sm text-xcore-muted">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
