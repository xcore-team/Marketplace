'use client'

import React from 'react'
import clsx from 'clsx'
import { HexBase } from './HexBase'
import { HexComponentProps } from './types'
import { TAILWIND_SIZES } from '../styles/constants'

/**
 * HexWelcome — Welcome/hero state
 * Full animations: wave legs, float, jump, max glow
 * Used for landing pages, hero sections
 */
export function HexWelcome({
  size = 'lg',
  className = '',
  animated = true,
  theme = 'dark',
  speed = 'normal',
  ariaLabel = 'Welcome mascotte',
}: HexComponentProps) {
  return (
    <div
      className={clsx(
        TAILWIND_SIZES[size],
        'flex items-center justify-center',
        className,
      )}
    >
      <HexBase
        size={size}
        className={clsx(
          animated && 'animate-float animate-glow-pulse',
          'filter drop-shadow-2xl',
        )}
        animated={animated}
        theme={theme}
        speed={speed}
        interactive={true}
        ariaLabel={ariaLabel}
      />
    </div>
  )
}
