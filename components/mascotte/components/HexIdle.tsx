'use client'

import React from 'react'
import clsx from 'clsx'
import { HexBase } from './HexBase'
import { HexComponentProps } from './types'
import { TAILWIND_SIZES } from '../styles/constants'

/**
 * HexIdle — Neutral idle state
 * Used for sidebars, navigation, placeholders
 */
export function HexIdle({
  size = 'md',
  className = '',
  animated = true,
  theme = 'dark',
  speed = 'normal',
  onClick,
  ariaLabel = 'HEX idle state',
}: HexComponentProps) {
  return (
    <div
      className={clsx(
        TAILWIND_SIZES[size],
        'flex items-center justify-center',
      )}
    >
      <HexBase
        size={size}
        className={clsx(
          'opacity-75',
          animated && 'animate-breathing',
          className,
        )}
        animated={animated}
        theme={theme}
        speed={speed}
        interactive={true}
        onClick={onClick}
        ariaLabel={ariaLabel}
      />
    </div>
  )
}
