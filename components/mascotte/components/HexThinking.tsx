'use client'

import React from 'react'
import clsx from 'clsx'
import { HexBase } from './HexBase'
import { HexComponentProps } from './types'
import { TAILWIND_SIZES } from '../styles/constants'

/**
 * HexThinking — Thinking/reflection state
 * Bounce animation with blue glow, thinking pose
 */
export function HexThinking({
  size = 'md',
  className = '',
  animated = true,
  theme = 'dark',
  speed = 'normal',
  message,
  ariaLabel = 'Thinking',
}: HexComponentProps) {
  return (
    <div className={clsx('flex flex-col items-center gap-4', className)}>
      <div className={clsx(TAILWIND_SIZES[size], 'flex items-center justify-center relative')}>
        {/* Question marks animation */}
        <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 text-2xl text-xcore-muted/50 animate-bounce">
          ?
        </div>

        <HexBase
          size={size}
          className={clsx(
            animated && 'animate-bounce animate-info-glow',
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
        <p className="text-xcore-muted text-sm text-center max-w-xs">
          {message}
        </p>
      )}
    </div>
  )
}
