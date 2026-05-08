/**
 * useScrollSpider Hook
 * Gère la logique de l'animation spider scroll avec états avancés
 */

import { useEffect, useState, useCallback } from 'react'
import { useScroll, useTransform, useSpring, MotionValue } from 'framer-motion'

export interface UseScrollSpiderOptions {
  /** Activer/désactiver le tracking */
  enabled?: boolean
  /** Hauteur maximale de descente (% du viewport) */
  maxScrollHeight?: number
  /** Stiffness du spring */
  springStiffness?: number
  /** Damping du spring */
  springDamping?: number
  /** Callback quand la mascotte atteint le bas */
  onReachBottom?: () => void
  /** Callback quand la mascotte remonte en haut */
  onReachTop?: () => void
  /** Seuil pour déclencher les callbacks (0-1) */
  threshold?: number
}

export interface ScrollSpiderState {
  /** Position Y actuelle (MotionValue) */
  y: MotionValue<number>
  /** Rotation actuelle (MotionValue) */
  rotate: MotionValue<number>
  /** Longueur du fil (MotionValue) */
  threadLength: MotionValue<number>
  /** Progress du scroll (0-1) */
  scrollProgress: number
  /** Est en haut */
  isAtTop: boolean
  /** Est en bas */
  isAtBottom: boolean
  /** Direction du scroll */
  scrollDirection: 'up' | 'down' | 'idle'
  /** Vitesse du scroll */
  scrollVelocity: number
}

export function useScrollSpider({
  enabled = true,
  maxScrollHeight = 80,
  springStiffness = 100,
  springDamping = 30,
  onReachBottom,
  onReachTop,
  threshold = 0.95,
}: UseScrollSpiderOptions = {}): ScrollSpiderState {
  const [scrollProgress, setScrollProgress] = useState(0)
  const [isAtTop, setIsAtTop] = useState(true)
  const [isAtBottom, setIsAtBottom] = useState(false)
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down' | 'idle'>('idle')
  const [scrollVelocity, setScrollVelocity] = useState(0)
  const [lastScrollY, setLastScrollY] = useState(0)

  // Scroll progress (0 to 1)
  const { scrollYProgress } = useScroll()

  // Calculate max scroll distance
  const maxDistance = typeof window !== 'undefined' 
    ? (window.innerHeight * maxScrollHeight) / 100 
    : 800

  // Transform scroll progress to Y position
  const rawY = useTransform(scrollYProgress, [0, 1], [0, maxDistance])

  // Apply spring for smooth motion
  const y = useSpring(rawY, {
    stiffness: springStiffness,
    damping: springDamping,
    restDelta: 0.001,
  })

  // Rotation based on scroll (swaying effect)
  const rotate = useTransform(
    scrollYProgress,
    [0, 0.25, 0.5, 0.75, 1],
    [0, 3, -2, 3, -1]
  )

  // Thread length matches Y position
  const threadLength = useSpring(rawY, {
    stiffness: springStiffness,
    damping: springDamping,
  })

  // Track scroll progress and direction
  useEffect(() => {
    if (!enabled) return

    const unsubscribe = scrollYProgress.on('change', (latest) => {
      setScrollProgress(latest)

      // Detect direction
      const currentScrollY = window.scrollY
      if (currentScrollY > lastScrollY) {
        setScrollDirection('down')
      } else if (currentScrollY < lastScrollY) {
        setScrollDirection('up')
      } else {
        setScrollDirection('idle')
      }

      // Calculate velocity
      const velocity = Math.abs(currentScrollY - lastScrollY)
      setScrollVelocity(velocity)
      setLastScrollY(currentScrollY)

      // Check thresholds
      const atTop = latest < (1 - threshold)
      const atBottom = latest > threshold

      setIsAtTop(atTop)
      setIsAtBottom(atBottom)

      // Trigger callbacks
      if (atBottom && onReachBottom) {
        onReachBottom()
      }
      if (atTop && onReachTop) {
        onReachTop()
      }
    })

    return () => unsubscribe()
  }, [enabled, scrollYProgress, lastScrollY, threshold, onReachBottom, onReachTop])

  return {
    y,
    rotate,
    threadLength,
    scrollProgress,
    isAtTop,
    isAtBottom,
    scrollDirection,
    scrollVelocity,
  }
}

/**
 * Hook simplifié pour juste obtenir le scroll progress
 */
export function useScrollProgress() {
  const [progress, setProgress] = useState(0)
  const { scrollYProgress } = useScroll()

  useEffect(() => {
    const unsubscribe = scrollYProgress.on('change', setProgress)
    return () => unsubscribe()
  }, [scrollYProgress])

  return progress
}
