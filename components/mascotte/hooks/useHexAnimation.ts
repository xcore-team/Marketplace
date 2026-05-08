/**
 * useHexAnimation Hook
 * Contrôle les animations du mascotte
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { ANIMATION_TIMINGS, SPEED_MULTIPLIERS, AnimationSpeed } from '../styles/constants'

export interface UseHexAnimationProps {
  state?: 'idle' | 'loading' | 'success' | 'error' | 'thinking' | 'empty' | 'welcome'
  speed?: AnimationSpeed
  autoPlay?: boolean
}

export function useHexAnimation({
  state = 'idle',
  speed = 'normal',
  autoPlay = true,
}: UseHexAnimationProps = {}) {
  const [isAnimating, setIsAnimating] = useState(autoPlay)
  const [currentState, setCurrentState] = useState(state)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Get timings for current state
  const timings = ANIMATION_TIMINGS[currentState as keyof typeof ANIMATION_TIMINGS] || ANIMATION_TIMINGS.idle
  const speedMultiplier = SPEED_MULTIPLIERS[speed]

  // Apply speed multiplier to all timings
  const scaledTimings = Object.entries(timings).reduce(
    (acc, [key, value]) => {
      const ms = parseInt(value) / speedMultiplier
      acc[key] = `${ms}ms`
      return acc
    },
    {} as Record<string, string>,
  )

  // Play animation
  const play = useCallback(() => {
    setIsAnimating(true)
  }, [])

  // Pause animation
  const pause = useCallback(() => {
    setIsAnimating(false)
  }, [])

  // Toggle animation
  const toggle = useCallback(() => {
    setIsAnimating((prev) => !prev)
  }, [])

  // Change state
  const changeState = useCallback((newState: UseHexAnimationProps['state']) => {
    setCurrentState(newState || 'idle')
  }, [])

  // Auto-reset for transient states
  useEffect(() => {
    if (['success', 'error'].includes(currentState)) {
      timerRef.current = setTimeout(
        () => {
          setCurrentState('idle')
        },
        2600, // Duration of most celebration animations
      )
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [currentState])

  return {
    isAnimating,
    currentState,
    scaledTimings,
    speedMultiplier,
    play,
    pause,
    toggle,
    changeState,
  }
}
