'use client'

import React from 'react'
import clsx from 'clsx'
import { HexBase } from './HexBase'
import { HexComponentProps } from './types'
import { TAILWIND_SIZES } from '../styles/constants'

/**
 * HexEmpty — Empty state
 * Waiting/idle posture with muted glow, used for empty results
 */
export function HexEmpty({
  size = 'md',
  className = '',
  animated = true,
  theme = 'dark',
  speed = 'normal',
  message = 'Nothing here yet',
  ariaLabel = 'Empty state',
}: HexComponentProps) {
  return (
    <div className={clsx('flex flex-col items-center gap-6', className)}>
      <div className={clsx(TAILWIND_SIZES[size], 'flex items-center justify-center')}>
        <HexBase
          size={size}
          className={clsx(
            animated && 'animate-float',
            'opacity-50 filter drop-shadow-lg',
          )}
          animated={animated}
          theme={theme}
          speed={speed}
          interactive={false}
          ariaLabel={ariaLabel}
        />
      </div>
      {message && (
        <div className="text-center">
          <p className="text-xcore-muted text-sm">{message}</p>
        </div>
      )}
    </div>
  )
}
