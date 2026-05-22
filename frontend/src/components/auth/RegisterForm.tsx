"use client"

import { useState } from "react"
import { Mail, Lock, User, ArrowRight } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import Input from "@/components/ui/Input"
import Button from "@/components/ui/Button"
import FormField from "@/components/ui/FormField"

import { register } from "@/services/authService"
import { validateRegister, hasErrors, isValidEmail, getRegisterPasswordError } from "@/lib/auth/validation"

import type { RegisterFormData, FieldErrors } from "@/types/auth"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.xcorehub.dev"

export default function RegisterForm() {

  const router = useRouter()

  const [formData, setFormData] = useState<RegisterFormData>({
    fullName: "",
    email: "",
    password: "",
  })
  const [confirmPassword, setConfirmPassword] = useState("")
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<RegisterFormData & { confirmPassword: string }>>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)


  const handleChange = (field: keyof RegisterFormData) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setFormData(prev => ({ ...prev, [field]: value }))


      setFieldErrors(prev => {
        const next = { ...prev }
        if (field === "fullName") {
          next.fullName = value.trim() ? undefined : "Full name is required"
        }
        if (field === "email") {
          next.email = isValidEmail(value) ? undefined : "Please enter a valid email"
        }
        if (field === "password") {
          next.password = getRegisterPasswordError(value)
          if (confirmPassword) {
            next.confirmPassword = value === confirmPassword ? undefined : "Passwords do not match"
          }
        }
        return next
      })
    }

  const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setConfirmPassword(value)
    setFieldErrors(prev => ({
      ...prev,
      confirmPassword: value === formData.password ? undefined : "Passwords do not match",
    }))
  }


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setApiError(null)

    // Validation complète avant d'envoyer
    const errors = validateRegister(formData, confirmPassword)
    if (hasErrors(errors)) {
      setFieldErrors(errors)
      return
    }

    setIsLoading(true)
    try {
      await register(formData)
      router.push("/login")
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsLoading(false)
    }
  }

  const canSubmit = !isLoading
    && formData.fullName.trim() !== ""
    && isValidEmail(formData.email)
    && !getRegisterPasswordError(formData.password)
    && formData.password === confirmPassword


  return (
    <div className="bg-surface border border-border rounded-2xl p-8 backdrop-blur-sm">

      <div className="mb-8">
        <div className="w-10 h-1 rounded-full mb-6 bg-primary" />
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          Create an account
        </h1>
        <p className="text-foreground/60 text-sm mt-1.5">
          Join the marketplace
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

        <FormField label="Full name" error={fieldErrors.fullName} required>
          <Input
            type="text"
            icon={User}
            placeholder="Moussa Dupont"
            value={formData.fullName}
            onChange={handleChange("fullName")}
            autoComplete="name"
          />
        </FormField>

        <FormField label="Email address" error={fieldErrors.email} required>
          <Input
            type="email"
            icon={Mail}
            placeholder="moussa@gmail.com"
            value={formData.email}
            onChange={handleChange("email")}
            autoComplete="email"
          />
        </FormField>

        <FormField label="Password" error={fieldErrors.password} hint="At least 8 chars, 1 uppercase, 1 digit" required>
          <Input
            type="password"
            icon={Lock}
            placeholder="••••••••"
            value={formData.password}
            onChange={handleChange("password")}
            autoComplete="new-password"
          />
        </FormField>

        <FormField label="Confirm password" error={fieldErrors.confirmPassword} required>
          <Input
            type="password"
            icon={Lock}
            placeholder="••••••••"
            value={confirmPassword}
            onChange={handleConfirmPasswordChange}
            autoComplete="new-password"
          />
        </FormField>

        {apiError && (
          <p className="text-sm text-red-400 text-center" role="alert">
            {apiError}
          </p>
        )}

        <Button
          type="submit"
          fullWidth
          icon={ArrowRight}
          className="mt-2"
          isLoading={isLoading}
          disabled={!canSubmit}
        >
          Create account
        </Button>

      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <span className="relative block text-center text-[11px] font-mono text-foreground/25 uppercase tracking-wider bg-surface px-2 w-fit mx-auto">
          or continue with
        </span>
      </div>

      <a
        href={`${API_URL}/app/auth/oauth/github/authorize?direct=true&redirect=${typeof window !== "undefined" ? window.location.origin : ""}/callback`}
        className="inline-flex items-center justify-center gap-2.5 w-full rounded-xl border border-border bg-surface/50 px-4 py-2.5 text-sm text-foreground/50 hover:text-foreground hover:border-primary/20 transition-all duration-200"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
        </svg>
        Continue with GitHub
      </a>

      <p className="text-center text-sm text-foreground/50 mt-6">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:opacity-80 transition-opacity">
          Sign in
        </Link>
      </p>

    </div>
  )
}