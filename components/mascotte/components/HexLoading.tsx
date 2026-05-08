'use client'

import React from 'react'
import clsx from 'clsx'
import { HexBase } from './HexBase'
import { HexComponentProps } from './types'
import { TAILWIND_SIZES } from '../styles/constants'

/**
 * HexLoading — Loading animation state
 * Spinning animation with fast blinking
 */
export function HexLoading({
  size = 'md',
  className = '',
  animated = true,
  theme = 'dark',
  speed = 'normal',
  message,
  ariaLabel = 'Loading',
}: HexComponentProps) {
  return (
    <div className={clsx('flex flex-col items-center gap-4', className)}>
      <div className={clsx(TAILWIND_SIZES[size], 'flex items-center justify-center')}>
        <HexBase
          size={size}
          className={clsx(
            animated && 'animate-spin',
            'filter drop-shadow-lg',
          )}
          animated={animated}
          theme={theme}
          speed={speed}
          interactive={false}
          ariaLabel={ariaLabel}
        />
      </div>
      {message && (
        <p className="text-xcore-muted text-sm animate-pulse">
          {message}
        </p>
      )}
    </div>
  )
}
