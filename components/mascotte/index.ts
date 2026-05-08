/**
 * HEX Mascotte Library — Main Exports
 * Import from '@/mascotte' or '@/components/mascotte'
 */

// Components
export * from './components'

// Hooks
export * from './hooks'

// Types
export type { HexComponentProps } from './components/types'
export type {
  HexSize,
  HexAnimationState,
  AnimationSpeed,
  ThemeMode,
} from './styles/constants'

// Constants
export {
  HEX_COLORS,
  HEX_SIZES,
  ANIMATION_TIMINGS,
  VIEWPORT_BOX,
  EYES,
  EYE_TRACKING,
  SPEED_MULTIPLIERS,
  TAILWIND_SIZES,
} from './styles/constants'
