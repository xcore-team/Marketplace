"use client"

import { useState } from "react"
import { Mail, Lock, User, ArrowRight } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import Input from "@/components/ui/Input"
import Button from "@/components/ui/Button"
import FormField from "@/components/ui/FormField"
import { RegisterFormData } from "@/types/auth"

export default function RegisterForm() {

  const [formData, setFormData] = useState<RegisterFormData>({
    fullName: "",
    email: "",
    password: "",
  })

  const [confirmPassword, setConfirmPassword] = useState<string>("")
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const [fieldErrors, setFieldErrors] = useState<{
    fullName?: string
    email?: string
    password?: string
    confirmPassword?: string
  }>({})

  const handleChange = (field: keyof RegisterFormData) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setFormData(prev => ({ ...prev, [field]: value }))

      // simple inline validation per-field
      setFieldErrors(prev => {
        const next = { ...prev }
        if (field === "fullName") {
          next.fullName = value.trim() ? undefined : "Full name is required"
        }
        if (field === "email") {
          next.email = validateEmail(value) ? undefined : "Please enter a valid email"
        }
        if (field === "password") {
          next.password = value.length >= 8 ? undefined : "Password must be at least 8 characters"
          // if confirmPassword already set, re-validate match
          if (confirmPassword) {
            next.confirmPassword = value === confirmPassword ? undefined : "Passwords do not match"
          }
        }
        return next
      })
    }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!validateAll()) return

    setIsLoading(true)

    try {
      const res = await fetch("http://localhost:8000/app/auth/register", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          full_name: formData.fullName,
        }),
      })

      if (res.ok) {
        // created
        router.push("/login")
        return
      }

      const data = await res.json().catch(() => null)
      if (data && data.detail) {
        setError(JSON.stringify(data.detail))
      } else if (data && data.message) {
        setError(data.message)
      } else {
        setError(`Registration failed (${res.status})`)
      }
    } catch (err: any) {
      setError(err?.message ?? "Network error")
    } finally {
      setIsLoading(false)
    }
  }

  function validateEmail(email: string) {
    return /^\S+@\S+\.\S+$/.test(email)
  }

  function validateAll() {
    const errs: typeof fieldErrors = {}
    if (!formData.fullName.trim()) errs.fullName = "Full name is required"
    if (!validateEmail(formData.email)) errs.email = "Please enter a valid email"
    if (formData.password.length < 8) errs.password = "Password must be at least 8 characters"
    if (formData.password !== confirmPassword) errs.confirmPassword = "Passwords do not match"

    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

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

        <FormField label="Full name" required>
          <Input
            type="text"
            icon={User}
            placeholder="Moussa Dupont"
            value={formData.fullName}
            onChange={handleChange("fullName")}
            autoComplete="name"
          />
          {fieldErrors.fullName && (
            <div className="text-sm text-red-400 mt-1">{fieldErrors.fullName}</div>
          )}
        </FormField>

        <FormField label="Email address" required>
          <Input
            type="email"
            icon={Mail}
            placeholder="moussa@gmail.com"
            value={formData.email}
            onChange={handleChange("email")}
            autoComplete="email"
          />
          {fieldErrors.email && (
            <div className="text-sm text-red-400 mt-1">{fieldErrors.email}</div>
          )}
        </FormField>

        <FormField label="Password" hint="8 characters minimum" required>
          <Input
            type="password"
            icon={Lock}
            placeholder="••••••••"
            value={formData.password}
            onChange={handleChange("password")}
            autoComplete="new-password"
          />
          {fieldErrors.password && (
            <div className="text-sm text-red-400 mt-1">{fieldErrors.password}</div>
          )}
        </FormField>

        <FormField label="Confirm password" required>
          <Input
            type="password"
            icon={Lock}
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => {
              const v = e.target.value
              setConfirmPassword(v)
              setFieldErrors(prev => ({
                ...prev,
                confirmPassword: v === formData.password ? undefined : "Passwords do not match",
              }))
            }}
            autoComplete="new-password"
          />
          {fieldErrors.confirmPassword && (
            <div className="text-sm text-red-400 mt-1">{fieldErrors.confirmPassword}</div>
          )}
        </FormField>

        {error && (
          <div className="text-sm text-red-400 mt-1">{error}</div>
        )}

        {/** disable submit unless basic client validation passes */}
        {(() => {
          const canSubmit = !isLoading
            && formData.fullName.trim() !== ""
            && /^\S+@\S+\.\S+$/.test(formData.email)
            && formData.password.length >= 8
            && formData.password === confirmPassword

          return (
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
          )
        })()}

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