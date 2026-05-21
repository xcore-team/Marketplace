"use client"

import { useState } from "react"
import { Eye, EyeOff, LucideIcon } from "lucide-react"

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  icon?: LucideIcon
  error?: string
}

export default function Input({
  label,
  icon: Icon,
  error,
  type = "text",
  className = "",
  ...props
}: InputProps) {

  const [showPassword, setShowPassword] = useState<boolean>(false)
  const inputType = type === "password" && showPassword ? "text" : type

  return (
    <div className="flex flex-col gap-1.5 w-full">

      {label && (
        <label className="text-sm font-medium text-foreground/80 tracking-wide">
          {label}
        </label>
      )}

      <div className="relative flex items-center">

        {Icon && (
          <div className="absolute left-3.5 pointer-events-none">
            <Icon size={17} strokeWidth={1.8} className="text-foreground/30" />
          </div>
        )}

        <input
          type={inputType}
          className={`
            w-full
            bg-foreground/5
            border border-border
            rounded-xl
            py-3
            text-sm text-foreground placeholder:text-foreground/25
            outline-none
            transition-all duration-200
            focus:border-primary/60 focus:bg-foreground/8 focus:ring-2 focus:ring-primary/10
            ${Icon ? "pl-10" : "pl-4"}
            ${type === "password" ? "pr-11" : "pr-4"}
            ${error ? "border-red-500/50 focus:border-red-500/60 focus:ring-red-500/10" : ""}
            ${className}
          `}
          {...props}
        />

        {type === "password" && (
          <button
            type="button"
            onClick={() => setShowPassword(prev => !prev)}
            className="absolute right-3.5 text-foreground/30 hover:text-foreground/70 transition-colors"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword
              ? <EyeOff size={17} strokeWidth={1.8} />
              : <Eye    size={17} strokeWidth={1.8} />
            }
          </button>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-400 pl-1" role="alert">
          {error}
        </p>
      )}

    </div>
  )
}