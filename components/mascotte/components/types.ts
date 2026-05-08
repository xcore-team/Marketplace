/**
 * HEX Mascotte — Shared Types
 */

import { ReactNode } from 'react'
import { HexSize, AnimationSpeed, HexAnimationState, ThemeMode } from '../styles/constants'

export interface HexComponentProps {
  /** Size variant */
  size?: HexSize
  /** Tailwind CSS classes */
  className?: string
  /** Enable animations */
  animated?: boolean
  /** Dark or light theme */
  theme?: ThemeMode
  /** Animation playback speed */
  speed?: AnimationSpeed
  /** Enable eye-tracking (HexBase only) */
  interactive?: boolean
  /** Click handler */
  onClick?: () => void
  /** Accessibility label */
  ariaLabel?: string
  /** Optional message or error text */
  message?: string | ReactNode
  /** Optional error description */
  error?: string | ReactNode
}
