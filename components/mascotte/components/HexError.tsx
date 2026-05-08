'use client'

import React from 'react'
import clsx from 'clsx'
import { HexBase } from './HexBase'
import { HexComponentProps } from './types'
import { TAILWIND_SIZES } from '../styles/constants'

/**
 * HexError — Error state
 * Shake animation with red glow
 */
export function HexError({
  size = 'md',
  className = '',
  animated = true,
  theme = 'dark',
  speed = 'normal',
  error,
  ariaLabel = 'Error',
}: HexComponentProps) {
  return (
    <div className={clsx('flex flex-col items-center gap-4', className)}>
      <div className={clsx(TAILWIND_SIZES[size], 'flex items-center justify-center')}>
        <HexBase
          size={size}
          className={clsx(
            animated && 'animate-shake animate-error-glow',
            'filter drop-shadow-xl',
          )}
          animated={animated}
          theme={theme}
          speed={speed}
          interactive={false}
          ariaLabel={ariaLabel}
        />
      </div>
      {error && (
        <div className="text-center">
          <p className="text-xcore-error font-semibold text-sm animate-fade-up">
            ✗ {error}
          </p>
        </div>
      )}
    </div>
  )
}
