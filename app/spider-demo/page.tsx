'use client'

import React, { useState } from 'react'
import { HexSpiderScroll, HexSpiderScrollAdvanced } from '@/components/mascotte'

/**
 * Page de démonstration de l'animation Spider Scroll
 * 
 * Cette page permet de tester les deux variantes :
 * - HexSpiderScroll : Version simple
 * - HexSpiderScrollAdvanced : Version avec états interactifs
 */
export default function SpiderDemoPage() {
  const [variant, setVariant] = useState<'simple' | 'advanced'>('advanced')
  const [position, setPosition] = useState<'left' | 'right' | 'center'>('right')
  const [size, setSize] = useState(120)
  const [showProgress, setShowProgress] = useState(true)
  const [showStates, setShowStates] = useState(true)

  return (
    <div className="min-h-[300vh] bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950">
      {/* Spider Animation */}
      {variant === 'simple' ? (
        <HexSpiderScroll
          position={position}
          size={size}
          enabled={true}
          maxScrollHeight={80}
        />
      ) : (
        <HexSpiderScrollAdvanced
          position={position}
          size={size}
          enabled={true}
          maxScrollHeight={80}
          showProgress={showProgress}
          showStates={showStates}
        />
      )}

      {/* Control Panel */}
      <div className="fixed top-4 left-4 z-50 bg-zinc-900/90 backdrop-blur-sm border border-zinc-800 rounded-lg p-6 max-w-xs">
        <h2 className="text-lg font-bold text-white mb-4">Spider Controls</h2>

        {/* Variant */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-zinc-400 mb-2">
            Variant
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setVariant('simple')}
              className={`px-3 py-1 rounded text-sm ${
                variant === 'simple'
                  ? 'bg-xcore-green text-black'
                  : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              Simple
            </button>
            <button
              onClick={() => setVariant('advanced')}
              className={`px-3 py-1 rounded text-sm ${
                variant === 'advanced'
                  ? 'bg-xcore-green text-black'
                  : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              Advanced
            </button>
          </div>
        </div>

        {/* Position */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-zinc-400 mb-2">
            Position
          </label>
          <div className="flex gap-2">
            {(['left', 'center', 'right'] as const).map((pos) => (
              <button
                key={pos}
                onClick={() => setPosition(pos)}
                className={`px-3 py-1 rounded text-sm capitalize ${
                  position === pos
                    ? 'bg-xcore-green text-black'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {pos}
              </button>
            ))}
          </div>
        </div>

        {/* Size */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-zinc-400 mb-2">
            Size: {size}px
          </label>
          <input
            type="range"
            min="80"
            max="200"
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Advanced Options */}
        {variant === 'advanced' && (
          <>
            <div className="mb-2">
              <label className="flex items-center gap-2 text-sm text-zinc-400">
                <input
                  type="checkbox"
                  checked={showProgress}
                  onChange={(e) => setShowProgress(e.target.checked)}
                  className="rounded"
                />
                Show Progress
              </label>
            </div>
            <div className="mb-4">
              <label className="flex items-center gap-2 text-sm text-zinc-400">
                <input
                  type="checkbox"
                  checked={showStates}
                  onChange={(e) => setShowStates(e.target.checked)}
                  className="rounded"
                />
                Show States
              </label>
            </div>
          </>
        )}

        {/* Info */}
        <div className="mt-6 pt-4 border-t border-zinc-800">
          <p className="text-xs text-zinc-500">
            Scroll down to see the spider descend along the thread. The animation is synchronized with your scroll position.
          </p>
        </div>
      </div>

      {/* Content Sections */}
      <div className="container mx-auto px-4 py-20">
        {/* Hero Section */}
        <section className="min-h-screen flex flex-col items-center justify-center text-center">
          <h1 className="text-6xl font-bold text-white mb-6">
            HEX Spider Scroll
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl mb-8">
            Une animation professionnelle et unique pour votre marketplace.
            La mascotte HEX descend le long d'un fil synchronisé avec le scroll.
          </p>
          <div className="flex gap-4">
            <div className="px-6 py-3 bg-xcore-green text-black rounded-lg font-semibold">
              Scroll Down ↓
            </div>
          </div>
        </section>

        {/* Feature 1 */}
        <section className="min-h-screen flex items-center justify-center">
          <div className="max-w-2xl">
            <h2 className="text-4xl font-bold text-white mb-6">
              🎯 Synchronisation Parfaite
            </h2>
            <p className="text-lg text-zinc-400 mb-4">
              L'animation est parfaitement synchronisée avec votre scroll.
              Utilisez Framer Motion pour des animations fluides et performantes.
            </p>
            <ul className="space-y-2 text-zinc-400">
              <li>✓ GPU-optimized (transform only)</li>
              <li>✓ Spring physics pour mouvement naturel</li>
              <li>✓ Rotation subtile pour effet réaliste</li>
              <li>✓ Fil qui s'étend dynamiquement</li>
            </ul>
          </div>
        </section>

        {/* Feature 2 */}
        <section className="min-h-screen flex items-center justify-center">
          <div className="max-w-2xl">
            <h2 className="text-4xl font-bold text-white mb-6">
              🎨 États Interactifs
            </h2>
            <p className="text-lg text-zinc-400 mb-4">
              La version avancée inclut des états visuels basés sur la position du scroll :
            </p>
            <ul className="space-y-2 text-zinc-400">
              <li>🟢 <strong>Idle</strong> - En haut de page</li>
              <li>🔵 <strong>Thinking</strong> - En train de descendre</li>
              <li>✨ <strong>Success</strong> - Arrivé en bas (avec célébration)</li>
              <li>📊 <strong>Progress</strong> - Indicateur de progression</li>
            </ul>
          </div>
        </section>

        {/* Feature 3 */}
        <section className="min-h-screen flex items-center justify-center">
          <div className="max-w-2xl">
            <h2 className="text-4xl font-bold text-white mb-6">
              ⚡ Performance
            </h2>
            <p className="text-lg text-zinc-400 mb-4">
              Optimisé pour des performances maximales :
            </p>
            <ul className="space-y-2 text-zinc-400">
              <li>✓ Utilise uniquement <code>transform</code> et <code>opacity</code></li>
              <li>✓ Pas de layout recalculation</li>
              <li>✓ 60 FPS constant</li>
              <li>✓ Respecte <code>prefers-reduced-motion</code></li>
            </ul>
          </div>
        </section>

        {/* End Section */}
        <section className="min-h-screen flex items-center justify-center">
          <div className="max-w-2xl text-center">
            <h2 className="text-4xl font-bold text-white mb-6">
              🎉 Vous êtes arrivé en bas !
            </h2>
            <p className="text-lg text-zinc-400 mb-8">
              La mascotte a terminé sa descente. Remontez pour la voir remonter !
            </p>
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="px-6 py-3 bg-xcore-green text-black rounded-lg font-semibold hover:bg-green-400 transition-colors"
            >
              ↑ Retour en haut
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
