'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import { useScrollSpider } from '../hooks/useScrollSpider'

export interface HexSpiderScrollAdvancedProps {
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
  /** Afficher les états (thinking, success, etc.) */
  showStates?: boolean
  /** Afficher le progress indicator */
  showProgress?: boolean
  /** Classe CSS additionnelle */
  className?: string
}

type SpiderState = 'idle' | 'thinking' | 'success' | 'bottom'

/**
 * HexSpiderScrollAdvanced — Version avancée avec états interactifs
 * 
 * Features:
 * - États visuels basés sur la position du scroll
 * - Indicateur de progression
 * - Animations de célébration en bas de page
 * - Effets de particules
 * - Interactions hover
 */
export function HexSpiderScrollAdvanced({
  position = 'right',
  offsetX = 40,
  size = 120,
  enabled = true,
  maxScrollHeight = 80,
  showStates = true,
  showProgress = true,
  className = '',
}: HexSpiderScrollAdvancedProps) {
  const [spiderState, setSpiderState] = useState<SpiderState>('idle')
  const [isHovered, setIsHovered] = useState(false)
  const [showCelebration, setShowCelebration] = useState(false)

  const {
    y,
    rotate,
    threadLength,
    scrollProgress,
    isAtBottom,
    scrollDirection,
    scrollVelocity,
  } = useScrollSpider({
    enabled,
    maxScrollHeight,
    springStiffness: 100,
    springDamping: 30,
    threshold: 0.9,
    onReachBottom: () => {
      if (showStates) {
        setSpiderState('success')
        setShowCelebration(true)
        setTimeout(() => setShowCelebration(false), 2000)
      }
    },
    onReachTop: () => {
      if (showStates) {
        setSpiderState('idle')
      }
    },
  })

  // Update state based on scroll progress
  useEffect(() => {
    if (!showStates) return

    if (scrollProgress > 0.9) {
      setSpiderState('bottom')
    } else if (scrollProgress > 0.5 && scrollDirection === 'down') {
      setSpiderState('thinking')
    } else if (scrollProgress < 0.1) {
      setSpiderState('idle')
    }
  }, [scrollProgress, scrollDirection, showStates])

  // Position classes
  const positionClasses = {
    left: 'left-0',
    right: 'right-0',
    center: 'left-1/2 -translate-x-1/2',
  }

  if (!enabled) return null

  return (
    <div
      className={clsx(
        'fixed top-0 z-50',
        positionClasses[position],
        className
      )}
      style={{
        [position === 'center' ? 'left' : position]: position === 'center' ? '50%' : `${offsetX}px`,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Thread (fil) avec gradient dynamique */}
      <motion.div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[2px] origin-top"
        style={{
          height: threadLength,
          background: `linear-gradient(to bottom, 
            rgba(100, 100, 100, 0.6) 0%, 
            rgba(0, 200, 150, ${scrollProgress * 0.5}) 50%, 
            rgba(0, 200, 150, ${scrollProgress * 0.8}) 100%)`,
          boxShadow: `0 0 ${4 + scrollVelocity * 0.5}px rgba(0, 200, 150, ${0.3 + scrollProgress * 0.3})`,
        }}
      />

      {/* Spider (mascotte) */}
      <motion.div
        className="relative cursor-pointer"
        style={{
          y,
          rotate,
          width: size,
          height: size,
        }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        {/* Glow effect dynamique */}
        <motion.div
          className="absolute inset-0 rounded-full blur-xl"
          animate={{
            opacity: isHovered ? 0.6 : 0.3,
            scale: isHovered ? 1.2 : 1,
          }}
          style={{
            background: `radial-gradient(circle, 
              ${spiderState === 'success' ? '#22C55E' : '#00C896'} 0%, 
              transparent 70%)`,
          }}
        />

        {/* HEX SVG avec états */}
        <motion.svg
          viewBox="0 0 484 315"
          className="w-full h-auto drop-shadow-lg"
          animate={{
            filter: spiderState === 'success' 
              ? 'drop-shadow(0 4px 20px rgba(34, 197, 94, 0.6))' 
              : 'drop-shadow(0 4px 12px rgba(0, 200, 150, 0.4))',
          }}
        >
          {/* Hexagon Body */}
          <motion.path
            d="M348.518 223.66L307.798 264.31C302.482 269.617 296.172 273.825 289.229 276.694C282.286 279.563 274.847 281.036 267.334 281.029L209.798 280.98C194.627 280.967 180.082 274.927 169.363 264.19L128.714 223.471C117.995 212.734 111.981 198.178 111.994 183.007L112.044 125.471C112.05 117.958 113.536 110.521 116.417 103.583C119.298 96.6454 123.517 90.3429 128.833 85.0356L169.553 44.3864C180.29 33.6678 194.845 27.6534 210.017 27.6665L267.553 27.7162C275.065 27.7226 282.502 29.2087 289.44 32.0895C296.378 34.9702 302.681 39.1893 307.988 44.5058L348.637 85.2251C359.356 95.9623 365.37 110.518 365.357 125.689L365.307 183.225C365.294 198.397 359.255 212.942 348.518 223.66Z"
            fill={spiderState === 'success' ? '#22C55E' : '#00C896'}
            stroke="black"
            strokeWidth="6.39873"
            animate={{
              scale: spiderState === 'thinking' ? [1, 1.05, 1] : 1,
            }}
            transition={{
              duration: 1,
              repeat: spiderState === 'thinking' ? Infinity : 0,
            }}
          />

          {/* Eyes avec animation */}
          <g>
            {/* Left Eye */}
            <circle cx="182.868" cy="140.863" r="42.107" fill="white" stroke="black" strokeWidth="6.39874" />
            <motion.circle
              cx="190.814"
              cy="132.178"
              r="22.17"
              fill="black"
              animate={{
                scaleY: spiderState === 'thinking' ? [1, 0.1, 1] : 1,
              }}
              transition={{
                duration: 0.3,
                repeat: spiderState === 'thinking' ? Infinity : 0,
                repeatDelay: 2,
              }}
            />
            <circle cx="199.397" cy="121.222" r="6.368" fill="white" />

            {/* Right Eye */}
            <circle cx="297.804" cy="140.863" r="42.107" fill="white" stroke="black" strokeWidth="6.39874" />
            <motion.circle
              cx="289.858"
              cy="132.178"
              r="22.17"
              fill="black"
              animate={{
                scaleY: spiderState === 'thinking' ? [1, 0.1, 1] : 1,
              }}
              transition={{
                duration: 0.3,
                repeat: spiderState === 'thinking' ? Infinity : 0,
                repeatDelay: 2,
              }}
            />
            <circle cx="281.274" cy="121.222" r="6.368" fill="white" />
          </g>

          {/* Smile */}
          <path
            d="M220.139 204.991C220.139 204.991 237.88 213.911 263.869 200.04"
            stroke="black"
            strokeWidth="6.39874"
            strokeLinecap="round"
          />

          {/* Spider Legs */}
          <g opacity="0.9">
            <path d="M111.016 183.071C108.394 183.094 105.73 183.251 103.029 183.597C92.225 184.98 80.7038 190.242 72.3203 200.944" fill="#00C896" stroke="black" strokeWidth="6.39874" strokeLinecap="round" />
            <path d="M129.754 217.243C121.296 217.022 111.999 219.041 105.172 226.067C97.3697 234.098 94.7823 244.53 92.7774 255.86" fill="#00C896" stroke="black" strokeWidth="6.39874" strokeLinecap="round" />
            <path d="M81.8067 151.39C73.8475 151.657 66.0617 153.773 59.0333 158.659C44.9767 168.432 37.093 185.235 30.1485 204.796" fill="#00C896" stroke="black" strokeWidth="6.39874" strokeLinecap="round" />
            <path d="M372.992 178.05C375.613 178.073 378.277 178.23 380.978 178.576C391.782 179.959 403.303 185.221 411.687 195.923" fill="#00C896" stroke="black" strokeWidth="6.39874" strokeLinecap="round" />
            <path d="M354.253 212.222C362.711 212.001 372.008 214.02 378.835 221.046C386.638 229.077 389.225 239.509 391.23 250.839" fill="#00C896" stroke="black" strokeWidth="6.39874" strokeLinecap="round" />
            <path d="M402.201 146.369C410.16 146.636 417.946 148.752 424.974 153.638C439.031 163.411 446.914 180.214 453.859 199.775" fill="#00C896" stroke="black" strokeWidth="6.39874" strokeLinecap="round" />
          </g>
        </motion.svg>

        {/* Breathing animation */}
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

      {/* Progress Indicator */}
      {showProgress && (
        <motion.div
          className="absolute -left-12 top-1/2 -translate-y-1/2"
          initial={{ opacity: 0 }}
          animate={{ opacity: scrollProgress > 0.05 ? 1 : 0 }}
        >
          <div className="flex flex-col items-center gap-2">
            <div className="text-xs font-mono text-zinc-500">
              {Math.round(scrollProgress * 100)}%
            </div>
            <div className="w-1 h-20 bg-zinc-800 rounded-full overflow-hidden">
              <motion.div
                className="w-full bg-gradient-to-b from-xcore-green to-green-400"
                style={{
                  height: `${scrollProgress * 100}%`,
                }}
              />
            </div>
          </div>
        </motion.div>
      )}

      {/* Celebration particles */}
      <AnimatePresence>
        {showCelebration && (
          <motion.div className="absolute inset-0 pointer-events-none">
            {[...Array(8)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-2 h-2 rounded-full bg-xcore-green"
                initial={{
                  x: 0,
                  y: 0,
                  scale: 0,
                  opacity: 1,
                }}
                animate={{
                  x: Math.cos((i * Math.PI * 2) / 8) * 60,
                  y: Math.sin((i * Math.PI * 2) / 8) * 60,
                  scale: [0, 1, 0],
                  opacity: [1, 1, 0],
                }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 1,
                  ease: 'easeOut',
                }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* State indicator (debug) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs font-mono text-zinc-600 whitespace-nowrap">
          {spiderState}
        </div>
      )}
    </div>
  )
}
