"use client"

import { useState } from "react"
import { Mail, Lock, User, ArrowRight } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import Input from "@/components/ui/Input"
import Button from "@/components/ui/Button"
import FormField from "@/components/ui/FormField"

import { register } from "@/services/authService"
import { validateRegister, hasErrors, isValidEmail, isValidPassword } from "@/lib/auth/validation"

import type { RegisterFormData, FieldErrors } from "@/types/auth"

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

  // ─── Validation inline (au fur et à mesure que l'user tape) ─────────────
  const handleChange = (field: keyof RegisterFormData) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setFormData(prev => ({ ...prev, [field]: value }))

      // On réutilise les helpers de validation.ts — pas de logique dupliquée
      setFieldErrors(prev => {
        const next = { ...prev }
        if (field === "fullName") {
          next.fullName = value.trim() ? undefined : "Full name is required"
        }
        if (field === "email") {
          next.email = isValidEmail(value) ? undefined : "Please enter a valid email"
        }
        if (field === "password") {
          next.password = isValidPassword(value) ? undefined : "Password must be at least 8 characters"
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

  // ─── Soumission ──────────────────────────────────────────────────────────
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
      // register() throw si erreur → on arrive ici seulement si succès
      router.push("/login")
    } catch (err: unknown) {
      // err est une Error throwée par authService
      setApiError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsLoading(false)
    }
  }

  // ─── Le bouton submit est actif seulement si le form est valide ──────────
  const canSubmit = !isLoading
    && formData.fullName.trim() !== ""
    && isValidEmail(formData.email)
    && isValidPassword(formData.password)
    && formData.password === confirmPassword

  // ─── UI ──────────────────────────────────────────────────────────────────
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

        <FormField label="Password" error={fieldErrors.password} hint="8 characters minimum" required>
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
          Create account
        </Button>

      </form>

      <p className="text-center text-sm text-foreground/50 mt-6">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:opacity-80 transition-opacity">
          Sign in
        </Link>
      </p>

    </div>
  )
}