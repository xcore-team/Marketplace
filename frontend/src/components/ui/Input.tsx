"use client";

import {Eye, EyeOff, LucideIcon} from "lucide-react";
import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    icon?: LucideIcon;
    error?: string;
}

export default function Input({
    label,
    icon: Icon,
    error,
    type = "text",
    className = "",
    ...props
    
}: InputProps){
    const [showPassword, setShowPassword] = React.useState(false);
    const inputType = type === "password" && showPassword ? "text" : type;
    return (
        <div className="flex flex-col gap-1.5 w-full">
 
      {label && (
        <label className="text-sm font-medium text-gray-300 tracking-wide">
          {label}
        </label>
      )}
 
      
      <div className="relative flex items-center">
 
        {Icon && (
          <div className="absolute left-3.5 pointer-events-none">
            <Icon size={17} strokeWidth={1.8} className="text-gray-500" />
          </div>
        )}
 
        <input
          type={inputType}
          className={`
            w-full
            bg-white/5
            border border-white/10
            rounded-xl
            py-3
            text-sm text-white placeholder:text-gray-600
            outline-none
            transition-all duration-200
            focus:border-violet-500/60 focus:bg-white/8 focus:ring-2 focus:ring-violet-500/10
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
           
            className="absolute right-3.5 text-gray-500 hover:text-gray-300 transition-colors"
            aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          >
            {showPassword
              ? <EyeOff size={17} strokeWidth={1.8} />
              : <Eye size={17} strokeWidth={1.8} />
            }
          </button>
        )}
      </div>
 
    
      {error && (
        <p className="text-xs text-red-400 pl-1">
          {error}
        </p>
      )}
 
    </div>
    )
}