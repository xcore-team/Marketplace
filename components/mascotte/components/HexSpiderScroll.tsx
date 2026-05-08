'use client'

import React, { useRef, useEffect, useState } from 'react'
import { motion, useScroll, useTransform, useSpring } from 'framer-motion'
import clsx from 'clsx'

export interface HexSpiderScrollProps {
  /** Position fixe (left, right, center) */
  position?: 'left' | 'right' | 'center'
  /** Offset horizontal en pixels */
  offsetX?: number
  /** Taille de la mascotte */
  size?: number
  /** Activer/désactiver l'animation */
  enabled?: boolean
  /** Hauteur maximale de descente (% du viewport) */
  maxScrollHeight?: number
  /** Vitesse du spring (plus élevé = plus rapide) */
  springStiffness?: number
  /** Damping du spring (plus élevé = moins de rebond) */
  springDamping?: number
  /** Classe CSS additionnelle */
  className?: string
}

/**
 * HexSpiderScroll — Mascotte araignée qui descend le long d'un fil
 * synchronisé avec le scroll de la page
 * 
 * Features:
 * - Descente fluide synchronisée au scroll
 * - Animation spring pour mouvement naturel
 * - Fil qui s'étend avec la descente
 * - Rotation subtile pour effet réaliste
 * - GPU-optimized (transform only)
 * - Responsive positioning
 */
export function HexSpiderScroll({
  position = 'right',
  offsetX = 40,
  size = 120,
  enabled = true,
  maxScrollHeight = 80,
  springStiffness = 100,
  springDamping = 30,
  className = '',
}: HexSpiderScrollProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  // Scroll progress (0 to 1)
  const { scrollYProgress } = useScroll()

  // Transform scroll progress to Y position with spring
  const rawY = useTransform(
    scrollYProgress,
    [0, 1],
    [0, (window.innerHeight * maxScrollHeight) / 100]
  )

  const y = useSpring(rawY, {
    stiffness: springStiffness,
    damping: springDamping,
    restDelta: 0.001,
  })

  // Subtle rotation based on scroll (spider swaying)
  const rotate = useTransform(scrollYProgress, [0, 0.5, 1], [0, 2, -2])

  // Thread length matches Y position
  const threadLength = useSpring(rawY, {
    stiffness: springStiffness,
    damping: springDamping,
  })

  // Position classes
  const positionClasses = {
    left: 'left-0',
    right: 'right-0',
    center: 'left-1/2 -translate-x-1/2',
  }

  // Show after mount (avoid SSR issues)
  useEffect(() => {
    setIsVisible(true)
  }, [])

  if (!enabled || !isVisible) return null

  return (
    <div
      ref={containerRef}
      className={clsx(
        'fixed top-0 z-50 pointer-events-none',
        positionClasses[position],
        className
      )}
      style={{
        [position === 'center' ? 'left' : position]: position === 'center' ? '50%' : `${offsetX}px`,
      }}
    >
      {/* Thread (fil) */}
      <motion.div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[2px] bg-gradient-to-b from-zinc-400/60 via-zinc-500/40 to-transparent origin-top"
        style={{
          height: threadLength,
          boxShadow: '0 0 4px rgba(0, 200, 150, 0.3)',
        }}
      />

      {/* Spider (mascotte) */}
      <motion.div
        className="absolute left-1/2 -translate-x-1/2"
        style={{
          y,
          rotate,
          width: size,
          height: size,
        }}
      >
        {/* Glow effect */}
        <div
          className="absolute inset-0 rounded-full blur-xl opacity-30"
          style={{
            background: 'radial-gradient(circle, #00C896 0%, transparent 70%)',
          }}
        />

        {/* HEX SVG */}
        <svg
          viewBox="0 0 484 315"
          className="w-full h-auto drop-shadow-lg"
          style={{
            filter: 'drop-shadow(0 4px 12px rgba(0, 200, 150, 0.4))',
          }}
        >
          {/* Hexagon Body */}
          <path
            d="M348.518 223.66L307.798 264.31C302.482 269.617 296.172 273.825 289.229 276.694C282.286 279.563 274.847 281.036 267.334 281.029L209.798 280.98C194.627 280.967 180.082 274.927 169.363 264.19L128.714 223.471C117.995 212.734 111.981 198.178 111.994 183.007L112.044 125.471C112.05 117.958 113.536 110.521 116.417 103.583C119.298 96.6454 123.517 90.3429 128.833 85.0356L169.553 44.3864C180.29 33.6678 194.845 27.6534 210.017 27.6665L267.553 27.7162C275.065 27.7226 282.502 29.2087 289.44 32.0895C296.378 34.9702 302.681 39.1893 307.988 44.5058L348.637 85.2251C359.356 95.9623 365.37 110.518 365.357 125.689L365.307 183.225C365.294 198.397 359.255 212.942 348.518 223.66Z"
            fill="#00C896"
            stroke="black"
            strokeWidth="6.39873"
          />

          {/* Left Eye */}
          <circle cx="182.868" cy="140.863" r="42.107" fill="white" stroke="black" strokeWidth="6.39874" />
          <circle cx="190.814" cy="132.178" r="22.17" fill="black" />
          <circle cx="199.397" cy="121.222" r="6.368" fill="white" />

          {/* Right Eye */}
          <circle cx="297.804" cy="140.863" r="42.107" fill="white" stroke="black" strokeWidth="6.39874" />
          <circle cx="289.858" cy="132.178" r="22.17" fill="black" />
          <circle cx="281.274" cy="121.222" r="6.368" fill="white" />

          {/* Smile */}
          <path
            d="M220.139 204.991C220.139 204.991 237.88 213.911 263.869 200.04"
            stroke="black"
            strokeWidth="6.39874"
            strokeLinecap="round"
          />

          {/* Spider Legs (8 legs) */}
          <g opacity="0.9">
            {/* Front Left Legs */}
            <path
              d="M111.016 183.071C108.394 183.094 105.73 183.251 103.029 183.597C92.225 184.98 80.7038 190.242 72.3203 200.944"
              fill="#00C896"
              stroke="black"
              strokeWidth="6.39874"
              strokeLinecap="round"
            />
            <path
              d="M129.754 217.243C121.296 217.022 111.999 219.041 105.172 226.067C97.3697 234.098 94.7823 244.53 92.7774 255.86"
              fill="#00C896"
              stroke="black"
              strokeWidth="6.39874"
              strokeLinecap="round"
            />

            {/* Back Left Legs */}
            <path
              d="M81.8067 151.39C73.8475 151.657 66.0617 153.773 59.0333 158.659C44.9767 168.432 37.093 185.235 30.1485 204.796"
              fill="#00C896"
              stroke="black"
              strokeWidth="6.39874"
              strokeLinecap="round"
            />

            {/* Front Right Legs */}
            <path
              d="M372.992 178.05C375.613 178.073 378.277 178.23 380.978 178.576C391.782 179.959 403.303 185.221 411.687 195.923"
              fill="#00C896"
              stroke="black"
              strokeWidth="6.39874"
              strokeLinecap="round"
            />
            <path
              d="M354.253 212.222C362.711 212.001 372.008 214.02 378.835 221.046C386.638 229.077 389.225 239.509 391.23 250.839"
              fill="#00C896"
              stroke="black"
              strokeWidth="6.39874"
              strokeLinecap="round"
            />

            {/* Back Right Legs */}
            <path
              d="M402.201 146.369C410.16 146.636 417.946 148.752 424.974 153.638C439.031 163.411 446.914 180.214 453.859 199.775"
              fill="#00C896"
              stroke="black"
              strokeWidth="6.39874"
              strokeLinecap="round"
            />
          </g>
        </svg>

        {/* Subtle breathing animation */}
        <motion.div
          className="absolute inset-0"
          animate={{
            scale: [1, 1.02, 1],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </motion.div>

      {/* Scroll indicator (optional, shows at top) */}
      <motion.div
        className="absolute top-4 left-1/2 -translate-x-1/2 text-xs text-zinc-500 font-mono opacity-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: scrollYProgress.get() > 0.05 ? 0 : 0.6 }}
        transition={{ duration: 0.3 }}
      >
        ↓ scroll
      </motion.div>
    </div>
  )
}
