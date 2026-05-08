'use client'

import React from 'react'
import clsx from 'clsx'
import { HexBase } from './HexBase'
import { HexComponentProps } from './types'
import { TAILWIND_SIZES } from '../styles/constants'

/**
 * HexReflection — Primary State: Reflection/Thinking
 *
 * According to design brief:
 * - Thinking pose (hand on chin)
 * - Processing animation
 * - Blue/purple glow
 * - Used for complex operations, help tooltips
 */
export function HexReflection({
  size = 'md',
  className = '',
  animated = true,
  theme = 'dark',
  speed = 'normal',
  message,
  ariaLabel = 'HEX in reflection',
}: HexComponentProps) {
  return (
    <div className={clsx('flex flex-col items-center gap-4', className)}>
      <div className={clsx(TAILWIND_SIZES[size], 'flex items-center justify-center relative')}>
        {/* Question mark above */}
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
