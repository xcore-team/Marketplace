"use client"

import { useState } from "react"
import { Mail, Lock, ArrowRight } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import Input from "@/components/ui/Input"
import Button from "@/components/ui/Button"
import FormField from "@/components/ui/FormField"

import { login } from "@/services/authService"
import { isValidEmail, isValidPassword, hasErrors } from "@/lib/auth/validation"

import type { LoginFormData, FieldErrors } from "@/types/auth"

export default function LoginForm() {

  const router = useRouter()

  const [formData, setFormData] = useState<LoginFormData>({
    email: "",
    password: "",
  })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<LoginFormData>>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // ─── Validation inline (au fur et à mesure que l'user tape) ─────────────
  const handleChange = (field: keyof LoginFormData) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setFormData(prev => ({ ...prev, [field]: value }))

      setFieldErrors(prev => {
        const next = { ...prev }
        if (field === "email") {
          next.email = isValidEmail(value) ? undefined : "Please enter a valid email"
        }
        if (field === "password") {
          next.password = isValidPassword(value) ? undefined : "Password must be at least 8 characters"
        }
        return next
      })
    }

  // ─── Soumission ──────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setApiError(null)

    // Validation complète avant d'envoyer
    const errors: FieldErrors<LoginFormData> = {}
    if (!isValidEmail(formData.email)) {
      errors.email = "Please enter a valid email"
    }
    if (!isValidPassword(formData.password)) {
      errors.password = "Password must be at least 8 characters"
    }

    if (hasErrors(errors)) {
      setFieldErrors(errors)
      return
    }

    setIsLoading(true)
    try {
      await login(formData.email, formData.password)
      router.push("/dashboard")
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsLoading(false)
    }
  }

  // ─── Le bouton submit est actif seulement si le form est valide ──────────
  const canSubmit = !isLoading
    && isValidEmail(formData.email)
    && isValidPassword(formData.password)

  return (
    <div className="bg-surface border border-border rounded-2xl p-8 backdrop-blur-sm">

      <div className="mb-8">
        <div className="w-10 h-1 rounded-full mb-6 bg-primary" />
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          Welcome back
        </h1>
        <p className="text-foreground/60 text-sm mt-1.5">
          Log in to your account
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

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

        <FormField label="Password" error={fieldErrors.password} required>
          <Input
            type="password"
            icon={Lock}
            placeholder="••••••••"
            value={formData.password}
            onChange={handleChange("password")}
            autoComplete="current-password"
          />
        </FormField>

        {/* Erreur globale API */}
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
          Login
        </Button>

      </form>

      <p className="text-center text-sm text-foreground/50 mt-6">
        No account yet?{" "}
        <Link href="/register" className="font-medium text-primary hover:opacity-80 transition-opacity">
          Register
        </Link>
      </p>

    </div>
  )
}