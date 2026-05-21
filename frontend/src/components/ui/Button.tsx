"use client"


import { Loader2, LucideIcon } from "lucide-react"


type ButtonVariant = "primary" | "outline" | "ghost"
type ButtonSize    = "sm" | "md" | "lg"


interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant   
  size?: ButtonSize         
  isLoading?: boolean       
  icon?: LucideIcon         
  fullWidth?: boolean       
  children: React.ReactNode 
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: `
    bg-primary text-white font-semibold
    hover:bg-primary/90
    shadow-lg shadow-primary/20
    hover:shadow-primary/30
  `,
  outline: `
    bg-transparent text-primary font-semibold
    border border-primary/50
    hover:bg-primary/10 hover:border-primary
  `,
  ghost: `
    bg-transparent text-gray-400 font-medium
    hover:text-white hover:bg-white/5
  `,
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-4 py-2 text-xs rounded-lg",
  md: "px-5 py-3 text-sm rounded-xl",
  lg: "px-6 py-3.5 text-base rounded-xl",
}


export default function Button({
  variant = "primary",    
  size = "md",
  isLoading = false,
  icon: Icon,             
  fullWidth = false,
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {

 
  const isDisabled = disabled || isLoading

  return (
    <button
      disabled={isDisabled}
      className={`
        inline-flex items-center justify-center gap-2
        transition-all duration-200
        cursor-pointer
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${fullWidth ? "w-full" : ""}
        ${isDisabled ? "opacity-50 cursor-not-allowed pointer-events-none" : ""}
        ${className}
      `}
      {...props}
    >
     

      {isLoading
        ? <Loader2
            size={16}
            className="animate-spin"
          />
        : Icon && <Icon size={16} strokeWidth={2} />
      }

      {children}

    </button>
  )
}