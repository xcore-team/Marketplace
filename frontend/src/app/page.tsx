"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import Link from "next/link"
import { motion, useInView } from "framer-motion"
import {
  Activity, ArrowRight, ArrowUpRight, Box, CheckCircle,
  Code2, FileCheck, Fingerprint, HeartPulse, Key,
  Package, Scale, Search, X,
} from "lucide-react"
import PluginBrowser from "@/components/plugin/PluginBrowser"
import PluginDetailsModal from "@/components/plugin/PluginDetailsModal"
import type { PublicPlugin } from "@/types/plugin"

// -- Data ---------------------------------------------------------------------

const GATES = [
  { icon: FileCheck,   name: "Intake Validation",    desc: "Manifest integrity, forbidden files, typosquatting protection" },
  { icon: Code2,       name: "Static Analysis",      desc: "AST parsing, dangerous calls, taint flows" },
  { icon: Package,     name: "Supply Chain",         desc: "CVE audit, version pinning, URL imports" },
  { icon: Key,         name: "Secrets Detection",    desc: "Entropy scoring, API keys, credential patterns" },
  { icon: Box,         name: "Sandbox Execution",    desc: "Isolated runtime · 128 MB · 10 s CPU cap" },
  { icon: Activity,    name: "Behavioral Analysis",  desc: "Network activity, file I/O, abnormal syscalls" },
  { icon: Fingerprint, name: "Cryptographic Signing", desc: "Merkle root + RSA for tamper-proof distribution" },
  { icon: Scale,       name: "License Compliance",   desc: "Copyleft detection, license compatibility" },
  { icon: HeartPulse,  name: "Supply Health",        desc: "OpenSSF scorecard, maintenance frequency" },
]

const STEPS = [
  {
    n: "01",
    title: "Build your plugin",
    desc: "Write a plugin.yaml manifest, implement Python logic, add docs — README, integration guide. Package as ZIP.",
  },
  {
    n: "02",
    title: "Submit for review",
    desc: "Upload through the developer dashboard. Celery picks it up immediately. Real-time SSE keeps you updated at every step.",
  },
  {
    n: "03",
    title: "Publish and distribute",
    desc: "Score ≤ 30 → auto-published. 31–79 → manual review. ≥ 80 → rejected with full per-gate breakdown.",
  },
]

function FadeIn({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-50px" })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 14 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.38, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// -- Page ---------------------------------------------------------------------

export default function MarketplacePage() {
  const [selected, setSelected]             = useState<PublicPlugin | null>(null)
  const [modalOpen, setModalOpen]           = useState(false)

  function openDetails(plugin: PublicPlugin) { setSelected(plugin); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setTimeout(() => setSelected(null), 300) }

  return (
    <div className="font-sans min-h-full bg-background">

      {/* -- HERO ---------------------------------------------------------------- */}
      <section className="border-b border-border bg-surface/10">
        <div className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
          <FadeIn>
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.06] px-3 py-0.5 mb-4">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-[10px] font-mono text-primary/70 tracking-widest uppercase">
                  Plugin Registry
                </span>
              </span>

              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-foreground leading-tight">
                Discover, rate, and share
                <br />
                <span className="text-primary">XCore plugins</span>
              </h1>

              <p className="mt-3 text-[13px] sm:text-sm text-foreground/42 leading-relaxed max-w-lg">
                Browse community-driven plugins for the XCore ecosystem.
                Every submission passes through a 9-gate automated security pipeline
                before reaching the registry.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  href="#browser"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-background text-sm font-semibold hover:bg-primary/90 transition-colors"
                >
                  Browse plugins
                  <ArrowRight size={14} strokeWidth={2.2} />
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm text-foreground/50 hover:text-foreground hover:border-primary/20 transition-colors"
                >
                  Submit a plugin
                  <ArrowUpRight size={13} strokeWidth={2} />
                </Link>
                <a
                  href="https://github.com/traoreera/xcore.git"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-2 rounded-xl border border-border/60 bg-surface/40 px-3.5 py-2 text-[11px] font-mono text-foreground/38 transition-all duration-200 hover:border-primary/20 hover:text-foreground/60"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="transition-colors duration-200 group-hover:text-primary">
                    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                    <path d="M9 18c-4.51 2-5-2-7-2" />
                  </svg>
                  xcore
                  <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1 py-0.5 text-[7px] font-semibold text-emerald-400/80 leading-none">MIT</span>
                </a>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* -- 1. PLUGIN BROWSER -------------------------------------------------- */}
      <section id="browser">
        <PluginBrowser onOpenDetails={openDetails} />
      </section>

      {/* -- 2. HOW IT WORKS ---------------------------------------------------- */}
      <section className="border-y border-border py-7 sm:py-9 bg-surface/20">
        <div className="mx-auto max-w-5xl px-6">
          <FadeIn className="mb-6">
            <p className="text-[10px] font-mono text-primary/50 tracking-widest uppercase mb-2">Process</p>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              From code to registry in minutes
            </h2>
            <p className="mt-1 text-[12px] text-foreground/38 max-w-sm">
              The submission flow is async — you upload, the pipeline processes in the background.
            </p>
          </FadeIn>

          <div className="grid sm:grid-cols-3 gap-px bg-border rounded-xl overflow-hidden border border-border">
            {STEPS.map((step, i) => (
              <FadeIn key={step.n} delay={i * 0.07}>
                <div className="bg-surface p-5 h-full">
                  <span className="step-number text-4xl font-black font-mono leading-none select-none text-foreground">
                    {step.n}
                  </span>
                  <h3 className="mt-3 text-sm font-semibold text-foreground">{step.title}</h3>
                  <p className="mt-1.5 text-[12px] text-foreground/38 leading-relaxed">{step.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* -- 3. SECURITY PIPELINE ----------------------------------------------- */}
      <section className="border-b border-border py-7 sm:py-9">
        <div className="mx-auto max-w-5xl px-6">

          <FadeIn>
            <div className="flex flex-wrap items-start justify-between gap-6 mb-6">
              <div>
                <p className="text-[10px] font-mono text-primary/50 tracking-widest uppercase mb-2">Security</p>
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  9 automated security checks
                </h2>
                <p className="mt-1 text-[12px] text-foreground/38 max-w-sm">
                  Gates run in parallel after intake. Each finding has a weighted score —
                  the total determines the publication outcome.
                </p>
              </div>

              <div className="flex flex-col gap-1.5 shrink-0">
                {[
                  { dot: "bg-emerald-400", label: "Score ≤ 30", badge: "auto-published" },
                  { dot: "bg-amber-400",   label: "Score 31–79", badge: "manual review" },
                  { dot: "bg-red-400",     label: "Score ≥ 80",  badge: "rejected" },
                ].map(r => (
                  <div key={r.label} className="flex items-center gap-2.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${r.dot}`} />
                    <span className="text-[11px] font-mono text-foreground/42">{r.label}</span>
                    <span className="text-[10px] font-mono text-foreground/22">→ {r.badge}</span>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {GATES.map((gate, i) => (
              <FadeIn key={gate.name} delay={i * 0.03}>
                <div className="flex items-start gap-3 p-3.5 rounded-xl border border-border bg-surface hover:border-primary/20 transition-colors duration-200 h-full">
                  <div className="shrink-0 w-7 h-7 rounded-lg bg-primary/[0.07] flex items-center justify-center mt-0.5">
                    <gate.icon size={13} className="text-primary/52" strokeWidth={1.8} />
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold text-foreground">{gate.name}</p>
                    <p className="mt-0.5 text-[11px] text-foreground/36 leading-relaxed">{gate.desc}</p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* -- 4. DEVELOPER CTA --------------------------------------------------- */}
      <section className="py-7 sm:py-9 bg-surface/20">
        <div className="mx-auto max-w-5xl px-6">
          <FadeIn>
            <div className="relative rounded-2xl border border-border bg-surface overflow-hidden p-7 sm:p-10">
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: "radial-gradient(ellipse 70% 100% at 50% 130%, rgba(0,200,150,0.07) 0%, transparent 65%)" }}
              />

              <div className="relative grid md:grid-cols-[1fr_auto] gap-7 items-start">
                <div>
                  <p className="text-[10px] font-mono text-primary/50 tracking-widest uppercase mb-3">For Developers</p>
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    Ready to publish your first plugin?
                  </h2>
                  <p className="mt-2 text-[13px] text-foreground/38 max-w-md leading-relaxed">
                    Implement against the XCore SDK, package as ZIP, and submit through the dashboard.
                    The pipeline gives you a full report — pass or fail, you know exactly why.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2.5">
                    <Link
                      href="/register"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-background text-sm font-semibold hover:bg-primary/90 transition-colors"
                    >
                      Create Account
                      <ArrowRight size={14} strokeWidth={2.2} />
                    </Link>
                    <Link
                      href="/login"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm text-foreground/50 hover:text-foreground hover:border-primary/20 transition-colors"
                    >
                      Sign In
                    </Link>
                  </div>
                </div>

                <div className="flex flex-col gap-2 shrink-0 md:pt-9">
                  {[
                    "ZIP upload with drag & drop",
                    "9-gate automated security review",
                    "Full per-gate score breakdown",
                    "Real-time SSE notifications",
                    "Semantic version management",
                    "GitHub integration",
                  ].map(f => (
                    <div key={f} className="flex items-center gap-2 text-[11.5px] text-foreground/38">
                      <CheckCircle size={11} strokeWidth={1.8} className="text-primary/48 shrink-0" />
                      {f}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Modal */}
      <PluginDetailsModal
        plugin={selected}
        isOpen={modalOpen}
        onClose={closeModal}
      />
    </div>
  )
}

