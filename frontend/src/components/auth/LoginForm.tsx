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

    <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-8 backdrop-blur-sm">


      <div className="mb-8">
        <div
          className="w-10 h-1 rounded-full mb-6 bg-primary"
        />
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Bon retour
        </h1>
        <p className="text-gray-500 text-sm mt-1.5">
          Connectez-vous à votre compte
        </p>
      </div>

  
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

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

        <FormField label="Mot de passe" required>
          <Input
            type="password"
            icon={Lock}
            placeholder="••••••••"
            value={formData.password}
            onChange={handleChange("password")}
            autoComplete="current-password"
          />
        </FormField>

        <div className="flex justify-end -mt-1">
          <Link
            href="/forgot-password"
            className="text-xs text-gray-500 hover:text-primary transition-colors"
            style={{ color: undefined }}
            
          >
            Mot de passe oublié ?
          </Link>
        </div>

        <Button
          type="submit"
          fullWidth
          icon={ArrowRight}
          className="mt-2"
        >
          Se connecter
        </Button>

      </form>

      <p className="text-center text-sm text-gray-500 mt-6">
        Pas encore de compte ?{" "}
       
        <Link
          href="/register"
          className="font-medium text-primary transition-colors hover:opacity-80"
        >
          S'inscrire
        </Link>
      </p>

    </div>
  )
}