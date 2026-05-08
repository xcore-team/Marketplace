'use client'

import React from 'react'
import clsx from 'clsx'
import { HexBase } from './HexBase'
import { HexComponentProps } from './types'
import { TAILWIND_SIZES } from '../styles/constants'

/**
 * HexSuccess — Success celebration state
 * Jump animation with intensified green glow
 */
export function HexSuccess({
  size = 'md',
  className = '',
  animated = true,
  theme = 'dark',
  speed = 'normal',
  message,
  ariaLabel = 'Success',
}: HexComponentProps) {
  return (
    <div className={clsx('flex flex-col items-center gap-4', className)}>
      <div className={clsx(TAILWIND_SIZES[size], 'flex items-center justify-center')}>
        <HexBase
          size={size}
          className={clsx(
            animated && 'animate-jump animate-success-glow',
            'filter drop-shadow-xl',
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
          <p className="text-xcore-green font-semibold text-sm animate-fade-up">
            ✓ {message}
          </p>
        </div>
      )}
    </div>
  )
}
