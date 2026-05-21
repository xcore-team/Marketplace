"use client"

import { useState } from "react"
import { Mail, Lock, ArrowRight } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import Input from "@/components/ui/Input"
import Button from "@/components/ui/Button"
import FormField from "@/components/ui/FormField"

import { login } from "@/services/authService"
import { validateLogin, hasErrors } from "@/lib/auth/validation"
import { useAuthStore } from "@/lib/auth/authStore"

import type { LoginFormData, FieldErrors } from "@/types/auth"

export default function LoginForm() {

  const router = useRouter()
  const { setAuth } = useAuthStore()

  const [formData, setFormData] = useState<LoginFormData>({
    email: "",
    password: "",
  })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<LoginFormData>>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleChange = (field: keyof LoginFormData) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setFormData(prev => ({ ...prev, [field]: value }))
      setFieldErrors(prev => {
        const next = { ...prev }
        const validation = validateLogin({ ...formData, [field]: value })
        if (field === "email") next.email = validation.email
        if (field === "password") next.password = validation.password
        return next
      })
    }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setApiError(null)

    const errors = validateLogin(formData)
    if (hasErrors(errors)) {
      setFieldErrors(errors)
      return
    }

    setIsLoading(true)
    try {
      const response = await login(formData)
      setAuth(response)
      router.push("/dashboard/plugins")
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : "Email or password incorrect")
    } finally {
      setIsLoading(false)
    }
  }

  const canSubmit = !isLoading && !hasErrors(validateLogin(formData))

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