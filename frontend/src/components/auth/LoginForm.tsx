"use client"

import { useState } from "react"
import { Mail, Lock, ArrowRight } from "lucide-react"
import Link from "next/link"

import Input from "@/components/ui/Input"
import Button from "@/components/ui/Button"
import FormField from "@/components/ui/FormField"
import { LoginFormData } from "@/types/auth"

export default function LoginForm() {

  const [formData, setFormData] = useState<LoginFormData>({
    email: "",
    password: "",
  })

  const handleChange = (field: keyof LoginFormData) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setFormData(prev => ({ ...prev, [field]: e.target.value }))
    }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log("Login data:", formData)
  }

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

        <FormField label="Email address" required>
          <Input
            type="email"
            icon={Mail}
            placeholder="moussa@gmail.com"
            value={formData.email}
            onChange={handleChange("email")}
            autoComplete="email"
          />
        </FormField>

        <FormField label="Password" required>
          <Input
            type="password"
            icon={Lock}
            placeholder="••••••••"
            value={formData.password}
            onChange={handleChange("password")}
            autoComplete="current-password"
          />
        </FormField>

        <Button type="submit" fullWidth icon={ArrowRight} className="mt-2">
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