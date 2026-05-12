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
          Créer un compte
        </h1>
        <p className="text-gray-500 text-sm mt-1.5">
          Rejoignez le marketplace
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

        <FormField label="Nom complet" required>
          <Input
            type="text"
            icon={User}
            placeholder="Rayane Dupont"
            value={formData.fullName}
            onChange={handleChange("fullName")}
            autoComplete="name"
          />
        </FormField>

        <FormField label="Adresse email" required>
          <Input
            type="email"
            icon={Mail}
            placeholder="ray@gmail.com"
            value={formData.email}
            onChange={handleChange("email")}
            autoComplete="email"
          />
        </FormField>

        <FormField label="Mot de passe" hint="8 caractères minimum" required>
          <Input
            type="password"
            icon={Lock}
            placeholder="••••••••"
            value={formData.password}
            onChange={handleChange("password")}
            autoComplete="new-password"
          />
        </FormField>

        <FormField label="Confirmer le mot de passe" required>
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
          Créer mon compte
        </Button>

      </form>

      <p className="text-center text-sm text-gray-500 mt-6">
        Déjà un compte ?{" "}
        <Link
          href="/login"
          className="font-medium text-primary transition-colors hover:opacity-80"
        >
          Se connecter
        </Link>
      </p>

    </div>
  )
}