"use client"

import { useState } from "react"
import { Star } from "lucide-react"

interface StarRatingProps {
  value: number
  count: number
  interactive?: boolean
  onRate?: (score: number) => void
  userRating?: number | null
  loading?: boolean
  size?: number
}

export default function StarRating({
  value,
  count,
  interactive = false,
  onRate,
  userRating,
  loading = false,
  size = 11,
}: StarRatingProps) {
  const [hovered, setHovered] = useState(0)

  const displayScore = userRating ?? value
  const isHalf = !userRating && !hovered
  const totalStars = 5

  function handleClick(score: number) {
    if (!interactive || loading) return
    onRate?.(score)
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: totalStars }, (_, i) => {
          const starIndex = i + 1
          const isFilled = hovered ? starIndex <= hovered : starIndex <= Math.round(displayScore)
          const isHalfFilled = isHalf && !Number.isInteger(value) && starIndex === Math.ceil(value)

          const starContent = isHalfFilled ? (
            <span className="relative inline-block">
              <Star size={size} strokeWidth={1.5} className="text-foreground/20" fill="none" />
              <span className="absolute inset-0 overflow-hidden" style={{ width: "50%" }}>
                <Star size={size} strokeWidth={1.5} className="text-amber-400" fill="currentColor" />
              </span>
            </span>
          ) : (
            <Star
              size={size}
              strokeWidth={1.5}
              className={isFilled ? "text-amber-400" : "text-foreground/20"}
              fill={isFilled ? "currentColor" : "none"}
            />
          )

          if (interactive) {
            return (
              <button
                key={i}
                type="button"
                disabled={loading}
                onMouseEnter={() => setHovered(starIndex)}
                onMouseLeave={() => setHovered(0)}
                onClick={() => handleClick(starIndex)}
                className={`
                  transition-all duration-150
                  ${!loading ? "cursor-pointer hover:scale-110" : "cursor-default"}
                  ${loading ? "opacity-40" : ""}
                `}
                aria-label={`${starIndex} star${starIndex > 1 ? "s" : ""}`}
              >
                {starContent}
              </button>
            )
          }

          return (
            <span key={i} className="inline-flex">
              {starContent}
            </span>
          )
        })}
      </div>

      {!interactive && (
        <span className="text-[10px] font-mono text-foreground/25">
          {count === 0
            ? "— no ratings"
            : `${value.toFixed(1)} · ${count}`
          }
        </span>
      )}

      {interactive && userRating !== null && userRating !== undefined && (
        <span className="text-[10px] font-mono text-amber-400/70 ml-0.5">
          {userRating}/5
        </span>
      )}
    </div>
  )
}
