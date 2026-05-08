'use client'

import React from 'react'
import clsx from 'clsx'
import { useHexInteraction } from '../hooks/useHexInteraction'
import { useHexAnimation } from '../hooks/useHexAnimation'
import { HexComponentProps } from './types'
import { TAILWIND_SIZES } from '../styles/constants'
import '../styles/animations.css'

/**
 * HexBase — Base mascotte component with eye-tracking
 * All other variants extend or wrap this component
 */
export function HexBase({
  size = 'md',
  className = '',
  animated = true,
  theme = 'dark',
  speed = 'normal',
  interactive = true,
  onClick,
  ariaLabel = 'HEX mascotte',
}: HexComponentProps) {
  const { svgRef, leftEyeOffset, rightEyeOffset, isHovering } = useHexInteraction({
    enabled: interactive,
  })

  const { isAnimating, scaledTimings } = useHexAnimation({
    state: 'idle',
    speed,
    autoPlay: animated,
  })

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 484 315"
      className={clsx(
        TAILWIND_SIZES[size],
        'h-auto',
        animated && isAnimating && 'animate-float animate-glow-pulse',
        interactive && isHovering && 'cursor-pointer opacity-90',
        className,
      )}
      style={{
        '--animation-duration-blink': scaledTimings.blink || '3s',
        '--animation-duration-breathing': scaledTimings.breathing || '4s',
      } as React.CSSProperties}
      onClick={onClick}
      role="img"
      aria-label={ariaLabel}
    >
      {/* SVG Content - Placeholder for actual mascotte SVG */}
      {/* Import the actual SVG content from hex-base.svg */}

      {/* Left Eye (with tracking) */}
      <circle
        cx={182.868 + leftEyeOffset.x}
        cy={140.863 + leftEyeOffset.y}
        r="6"
        fill="white"
        className="transition-all"
        style={{
          transitionDuration: '150ms',
        }}
      />

      {/* Right Eye (with tracking) */}
      <circle
        cx={297.804 + rightEyeOffset.x}
        cy={140.863 + rightEyeOffset.y}
        r="6"
        fill="white"
        className="transition-all"
        style={{
          transitionDuration: '150ms',
        }}
      />

      {/* Body placeholder */}
      <circle cx="242" cy="160" r="80" fill="url(#hexGradient)" opacity="0.8" />

      {/* Legs placeholder */}
      <g opacity="0.6">
        <line x1="200" y1="240" x2="180" y2="300" stroke="currentColor" strokeWidth="4" />
        <line x1="242" y1="240" x2="242" y2="300" stroke="currentColor" strokeWidth="4" />
        <line x1="284" y1="240" x2="304" y2="300" stroke="currentColor" strokeWidth="4" />
      </g>

      {/* Gradient definition */}
      <defs>
        <radialGradient id="hexGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#00C896" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#00C896" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  )
}
