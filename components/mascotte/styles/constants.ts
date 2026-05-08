/**
 * HEX Mascotte — Shared Constants
 * Valeurs utilisées par toutes les variantes
 */

export const HEX_COLORS = {
  primary: '#00C896',      // Green accent
  bg: '#080809',           // Dark background
  text: '#F4F4F5',         // Light text
  muted: '#9CA3AF',        // Secondary text
  success: '#22C55E',      // Success green
  error: '#EF4444',        // Error red
  warning: '#F59E0B',      // Warning amber
  info: '#3B82F6',         // Info blue
} as const

export const HEX_SIZES = {
  sm: { width: '120px', height: '80px' },
  md: { width: '240px', height: '160px' },
  lg: { width: '360px', height: '240px' },
  xl: { width: '480px', height: '315px' },
} as const

export const ANIMATION_TIMINGS = {
  // 4 Primary States from Design Brief
  rest: {
    breathing: '4s',
    blink: '3s',
    eyeFollow: '0.15s',
  },
  reflection: {
    bounce: '2s',
    float: '3s',
    rotation: '1.5s',
  },
  success: {
    celebration: '2.5s',
    float: '3s',
    jump: '0.6s',
  },
  error: {
    shake: '0.5s',
    pulse: '1.5s',
    tilt: '0.8s',
  },
  // Context-specific derivatives
  idle: {
    breathing: '4s',
    blink: '3s',
    eyeFollow: '0.15s',
  },
  loading: {
    spin: '1s',
    pulse: '2s',
    fastBlink: '0.6s',
  },
  thinking: {
    bounce: '2s',
    float: '3s',
    rotation: '1.5s',
  },
  empty: {
    float: '7s',
    pulse: '4s',
    breathing: '5s',
  },
  welcome: {
    wave: '3s',
    float: '7s',
    bounce: '2.5s',
    celebration: '3s',
  },
} as const

export const VIEWPORT_BOX = {
  width: 484,
  height: 315,
} as const

export const EYES = {
  left: { cx: 182.868, cy: 140.863 },
  right: { cx: 297.804, cy: 140.863 },
} as const

export const EYE_TRACKING = {
  maxOffset: 14,
  sensitivity: 0.09,
  minDistance: 1,
} as const

/**
 * Animation Speed Multipliers
 */
export const SPEED_MULTIPLIERS = {
  slow: 1.5,
  normal: 1,
  fast: 0.7,
} as const

/**
 * Tailwind Size Mapping
 */
export const TAILWIND_SIZES = {
  sm: 'max-w-[120px]',
  md: 'max-w-[240px]',
  lg: 'max-w-[360px]',
  xl: 'max-w-[480px]',
} as const

export type HexSize = keyof typeof HEX_SIZES
export type HexAnimationState = keyof typeof ANIMATION_TIMINGS
export type AnimationSpeed = keyof typeof SPEED_MULTIPLIERS
export type ThemeMode = 'light' | 'dark'
