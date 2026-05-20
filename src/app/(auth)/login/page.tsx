"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { authApi, AdminApiError, type TokenResponse } from "@/lib/admin-api";
import { setAuthCookies, clearAuthCookies } from "@/lib/admin-auth";
import { Eye, EyeOff, AlertTriangle } from "lucide-react";

// ── Credentials step ──────────────────────────────────────────────────────────

const schema = z.object({
  email:    z.string().email("Adresse email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});
type FormData = z.infer<typeof schema>;

function CredentialsForm({
  onSuccess,
}: {
  onSuccess: (res: TokenResponse) => void;
}) {
  const [showPw,      setShowPw]      = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setServerError(null);
    // Clear any stale session cookie so it doesn't interfere with the login request
    clearAuthCookies();
    try {
      const res = await authApi.login(data.email, data.password);
      onSuccess(res);
    } catch (err) {
      if (err instanceof AdminApiError) {
        if (err.status === 429) {
          setServerError("Trop de tentatives. Réessayez dans 15 minutes.");
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {serverError && (
        <div className="alert-danger flex items-start gap-3 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {serverError}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-2)" }}>
          Email
        </label>
        <input
          type="email"
          autoComplete="email"
          placeholder="admin@xcore.io"
          {...register("email")}
          className="input"
          style={errors.email ? { borderColor: "var(--signal-danger-border)" } : undefined}
        />
        {errors.email && (
          <p className="mt-1 text-xs" style={{ color: "var(--signal-danger)" }}>
            {errors.email.message}
          </p>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-2)" }}>
          Mot de passe
        </label>
        <div className="relative">
          <input
            type={showPw ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••••••"
            {...register("password")}
            className="input pr-10"
            style={errors.password ? { borderColor: "var(--signal-danger-border)" } : undefined}
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

      <button
        type="submit"
        disabled={isSubmitting}
        className="btn-primary w-full justify-center py-3 mt-2"
      >
        {isSubmitting ? (
          <>
            <span
              className="w-4 h-4 rounded-full border-2 animate-spin"
              style={{ borderColor: "rgba(0,0,0,0.2)", borderTopColor: "var(--bg)" }}
            />
            Connexion…
          </>
        ) : (
          "Se connecter →"
        )}
      </button>
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();
  const [next, setNext] = useState("/dashboard");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNext(params.get("next") ?? "/dashboard");
  }, []);

  function handleCredentialsSuccess(res: TokenResponse) {
    setAuthCookies({ access_token: res.access_token, refresh_token: res.refresh_token });
    router.push(next);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: "var(--bg)" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 60% 50% at 50% 100%, var(--xcore-deep) 0%, transparent 70%)",
        }}
      />

      <div className="relative w-full max-w-md mx-auto px-4 flex flex-col items-center">

        <div className="mb-2 animate-fade-in" style={{ animationDelay: "0ms" }}>
          <Image
            src="/XCore Mascotte.svg"
            alt="HEX — Mascotte XCore"
            width={148}
            height={148}
            priority
            style={{ filter: "drop-shadow(0 0 24px var(--xcore-glow))" }}
          />
        </div>

        <div className="text-center mb-8 animate-fade-in" style={{ animationDelay: "60ms" }}>
          <h1 className="font-display text-2xl font-bold" style={{ color: "var(--text-1)" }}>
            XCore Market
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-3)" }}>
            Admin Panel — accès restreint
          </p>
        </div>

        <div className="panel p-8 w-full animate-fade-in" style={{ animationDelay: "120ms" }}>
          <h2 className="font-display text-lg font-semibold mb-6" style={{ color: "var(--text-1)" }}>
            Connexion
          </h2>

          <CredentialsForm onSuccess={handleCredentialsSuccess} />

          <p className="text-xs text-center mt-6" style={{ color: "var(--text-3)" }}>
            Toutes les tentatives de connexion sont enregistrées.
          </p>
        </div>

      </div>
    </div>
  );
}
