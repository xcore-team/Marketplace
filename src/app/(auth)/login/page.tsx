"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { authApi, AdminApiError } from "@/lib/admin-api";
import { Eye, EyeOff, AlertTriangle } from "lucide-react";

const schema = z.object({
  email:    z.string().email("Adresse email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});
type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const [next, setNext] = useState("/dashboard");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNext(params.get("next") ?? "/dashboard");
  }, []);

  const [showPw, setShowPw]           = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setServerError(null);
    try {
      const res = await authApi.login(data.email, data.password);

      const secure = location.protocol === "https:" ? "; Secure" : "";
      const maxAge = 60 * 60 * 8;

      document.cookie = `admin_token=${res.access_token}; path=/; SameSite=Strict; max-age=${maxAge}${secure}`;
      document.cookie = `refresh_token=${res.refresh_token}; path=/; SameSite=Strict; max-age=${60 * 60 * 24 * 7}${secure}`;

      router.push(next);
    } catch (err) {
      if (err instanceof AdminApiError) {
        if (err.status === 429) {
          setServerError("Trop de tentatives. Compte verrouillé 15 minutes.");
        } else if (err.status === 401 || err.status === 400) {
          setServerError("Email ou mot de passe incorrect.");
        } else {
          setServerError(err.message);
        }
      } else {
        setServerError("Erreur réseau. Veuillez réessayer.");
      }
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: "var(--bg)" }}
    >
      {/* Halo de fond centré sur la mascotte */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 60% 50% at 50% 100%, rgba(0,200,150,0.06) 0%, transparent 70%)",
        }}
      />

      <div className="relative w-full max-w-md mx-auto px-4 flex flex-col items-center">

        {/* Mascotte HEX */}
        <div className="mb-2 animate-fade-in" style={{ animationDelay: "0ms" }}>
          <Image
            src="/XCore Mascotte.svg"
            alt="HEX — Mascotte XCore"
            width={160}
            height={160}
            priority
            style={{ filter: "drop-shadow(0 0 32px rgba(0,200,150,0.3))" }}
          />
        </div>

        {/* Titre */}
        <div className="text-center mb-8 animate-fade-in" style={{ animationDelay: "60ms" }}>
          <h1 className="font-display text-2xl font-bold" style={{ color: "var(--text-1)" }}>
            XCore Market
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-3)" }}>
            Admin Panel — accès restreint
          </p>
        </div>

        {/* Card */}
        <div className="panel p-8 w-full animate-fade-in" style={{ animationDelay: "120ms" }}>
          <h2
            className="font-display text-lg font-semibold mb-6"
            style={{ color: "var(--text-1)" }}
          >
            Connexion
          </h2>

          {serverError && (
            <div className="alert-danger flex items-start gap-3 mb-5 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Email */}
            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "var(--text-2)" }}
              >
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                placeholder="admin@gmail.com"
                {...register("email")}
                className="input"
                style={errors.email ? { borderColor: "rgba(239,68,68,0.5)" } : undefined}
              />
              {errors.email && (
                <p className="mt-1 text-xs" style={{ color: "var(--signal-danger)" }}>
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "var(--text-2)" }}
              >
                Mot de passe
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  {...register("password")}
                  className="input pr-10"
                  style={errors.password ? { borderColor: "rgba(239,68,68,0.5)" } : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--text-3)" }}
                  aria-label={showPw ? "Masquer" : "Afficher"}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-xs" style={{ color: "var(--signal-danger)" }}>
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full justify-center py-3 mt-2"
            >
              {isSubmitting ? (
                <>
                  <span
                    className="w-4 h-4 rounded-full border-2 animate-spin"
                    style={{
                      borderColor:    "rgba(0,0,0,0.2)",
                      borderTopColor: "#021810",
                    }}
                  />
                  Connexion…
                </>
              ) : (
                "Se connecter →"
              )}
            </button>
          </form>

          <p className="text-xs text-center mt-6" style={{ color: "var(--text-3)" }}>
            Toutes les tentatives de connexion sont enregistrées.
          </p>
        </div>
      </div>
    </div>
  );
}
