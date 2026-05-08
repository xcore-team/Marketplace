'use client'

import React from 'react'
import clsx from 'clsx'
import { HexBase } from './HexBase'
import { HexComponentProps } from './types'
import { TAILWIND_SIZES } from '../styles/constants'

/**
 * HexRest — Primary State: Rest
 * 
 * According to design brief:
 * - Neutral, calm state
 * - Light breathing animation
 * - Occasional blinking
 * - Used as default state everywhere
 */
export function HexRest({
  size = 'md',
  className = '',
  animated = true,
  theme = 'dark',
  speed = 'normal',
  interactive = true,
  onClick,
  ariaLabel = 'HEX mascotte at rest',
}: HexComponentProps) {
  return (
    <div className={clsx(TAILWIND_SIZES[size], 'flex items-center justify-center')}>
      <HexBase
        size={size}
        className={clsx(
          animated && 'animate-breathing',
          'opacity-85 transition-opacity',
          interactive && 'hover:opacity-100',
          className,
        )}
        animated={animated}
        theme={theme}
        speed={speed}
        interactive={interactive}
        onClick={onClick}
        ariaLabel={ariaLabel}
      />
    </div>
  )
}
