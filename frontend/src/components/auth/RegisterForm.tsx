"use client"

import { useState } from "react"
import { Mail, Lock, User, ArrowRight } from "lucide-react"
import Link from "next/link"

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


  const handleChange = (field: keyof RegisterFormData) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setFormData(prev => ({ ...prev, [field]: e.target.value }))
    }


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()


    console.log("Register data:", formData)
    console.log("Confirm password:", confirmPassword)

  }

  return (
    <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-8 backdrop-blur-sm">

      <div className="mb-8">
        <div
          className="w-10 h-1 rounded-full mb-6 bg-primary"
        />
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Create an account
        </h1>
        <p className="text-gray-500 text-sm mt-1.5">
          Join the xcore marketplace
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

        <FormField label="Full name" required>
          <Input
            type="text"
            icon={User}
            placeholder="Moussa Traoré"
            value={formData.fullName}
            onChange={handleChange("fullName")}
            autoComplete="name"
          />
        </FormField>

        <FormField label="Email Address" required>
          <Input
            type="email"
            icon={Mail}
            placeholder="moussa@gmail.com"
            value={formData.email}
            onChange={handleChange("email")}
            autoComplete="email"
          />
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
        </FormField>

        <FormField label="Confirm Password" required>
          <Input
            type="password"
            icon={Lock}
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
        </FormField>

        <Button
          type="submit"
          fullWidth
          icon={ArrowRight}
          className="mt-2"
        >
          Create an account
        </Button>

      </form>

      <p className="text-center text-sm text-gray-500 mt-6">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-primary transition-colors hover:opacity-80"
        >
          Log in
        </Link>
      </p>

    </div>
  )
}