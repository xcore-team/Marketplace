/**
 * useHexInteraction Hook
 * Gère les interactions utilisateur (eye-tracking, mouse events)
 */

import { useRef, useState, useEffect, useCallback } from 'react'
import { VIEWPORT_BOX, EYES, EYE_TRACKING } from '../styles/constants'

interface Offset {
  x: number
  y: number
}

export interface UseHexInteractionProps {
  enabled?: boolean
  onHover?: (isHovering: boolean) => void
}

export function useHexInteraction({
  enabled = true,
  onHover,
}: UseHexInteractionProps = {}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [leftEyeOffset, setLeftEyeOffset] = useState<Offset>({ x: 0, y: 0 })
  const [rightEyeOffset, setRightEyeOffset] = useState<Offset>({ x: 0, y: 0 })
  const [isHovering, setIsHovering] = useState(false)

  /**
   * Calculate eye offset based on mouse position
   */
  const calcOffset = useCallback(
    (eyeCx: number, eyeCy: number, mx: number, my: number, rect: DOMRect): Offset => {
      // Scale mouse position to SVG viewBox
      const sx = ((mx - rect.left) / rect.width) * VIEWPORT_BOX.width
      const sy = ((my - rect.top) / rect.height) * VIEWPORT_BOX.height

      // Calculate distance from eye to mouse
      const dx = sx - eyeCx
      const dy = sy - eyeCy
      const dist = Math.sqrt(dx * dx + dy * dy)

      // Avoid division by zero
      if (dist < EYE_TRACKING.minDistance) {
        return { x: 0, y: 0 }
      }

      // Calculate offset magnitude (capped at MAX_OFFSET)
      const r = Math.min(dist * EYE_TRACKING.sensitivity, EYE_TRACKING.maxOffset)

      return {
        x: (dx / dist) * r,
        y: (dy / dist) * r,
      }
    },
    [],
  )

  /**
   * Handle mouse move
   */
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!enabled || !svgRef.current) return

      const rect = svgRef.current.getBoundingClientRect()
      setLeftEyeOffset(calcOffset(EYES.left.cx, EYES.left.cy, e.clientX, e.clientY, rect))
      setRightEyeOffset(calcOffset(EYES.right.cx, EYES.right.cy, e.clientX, e.clientY, rect))
    },
    [enabled, calcOffset],
  )

  /**
   * Handle mouse leave
   */
  const handleMouseLeave = useCallback(() => {
    setLeftEyeOffset({ x: 0, y: 0 })
    setRightEyeOffset({ x: 0, y: 0 })
    setIsHovering(false)
    onHover?.(false)
  }, [onHover])

  /**
   * Handle hover
   */
  const handleMouseEnter = useCallback(() => {
    setIsHovering(true)
    onHover?.(true)
  }, [onHover])

  /**
   * Setup event listeners
   */
  useEffect(() => {
    if (!enabled) return

    const element = svgRef.current
    if (!element) return

    // Use capture phase for passive events (performance)
    element.addEventListener('mouseenter', handleMouseEnter, { passive: true })
    element.addEventListener('mouseleave', handleMouseLeave, { passive: true })
    window.addEventListener('mousemove', handleMouseMove, { passive: true })

    return () => {
      element.removeEventListener('mouseenter', handleMouseEnter)
      element.removeEventListener('mouseleave', handleMouseLeave)
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [enabled, handleMouseMove, handleMouseLeave, handleMouseEnter])

  return {
    svgRef,
    leftEyeOffset,
    rightEyeOffset,
    isHovering,
  }
}
