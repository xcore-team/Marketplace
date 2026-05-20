"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { usersApi, type UserAdminOut, AdminApiError } from "@/lib/admin-api";
import {
  ArrowLeft, RefreshCw, UserX, UserCheck, Trash2,
  ShieldCheck, Shield, Loader2, AlertTriangle,
  Mail, Calendar, Puzzle, ClipboardList, KeyRound, Github,
} from "lucide-react";
import Link from "next/link";

function ConfirmDeleteModal({
  email,
  onConfirm,
  onCancel,
  busy,
}: {
  email: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
      onClick={onCancel}
    >
      <div
        className="panel p-6 w-full max-w-sm mx-4 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "var(--signal-danger-dim)" }}
          >
            <Trash2 className="w-4 h-4" style={{ color: "var(--signal-danger)" }} />
          </div>
          <div>
            <div className="font-display font-semibold text-sm" style={{ color: "var(--text-1)" }}>
              Supprimer ce compte
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
              Action irréversible
            </div>
          </div>
        </div>
        <p className="text-xs" style={{ color: "var(--text-2)" }}>
          Le compte{" "}
          <span className="mono-value font-semibold" style={{ color: "var(--text-1)" }}>
            {email}
          </span>{" "}
          et tous ses plugins et soumissions seront définitivement supprimés.
        </p>
        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            disabled={busy}
            className="btn-ghost btn-sm flex-1"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="btn-danger btn-sm flex-1"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const isAdmin = role.includes("admin") || role.includes("super");
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold"
      style={{
        background: isAdmin ? "var(--xcore-dim)"      : "var(--muted-dim)",
        color:      isAdmin ? "var(--xcore)"          : "var(--text-3)",
        border:     `1px solid ${isAdmin ? "var(--xcore-glow)" : "var(--muted-border)"}`,
      }}
    >
      {isAdmin ? <ShieldCheck className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
      {role}
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  accent?: string;
}) {
  return (
    <div
      className="panel p-4 flex items-start gap-3"
      style={{ flex: 1, minWidth: 0 }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: accent ? `${accent}18` : "var(--surface-2)" }}
      >
        <Icon className="w-4 h-4" style={{ color: accent ?? "var(--text-3)" }} />
      </div>
      <div className="min-w-0">
        <div className="text-[11px]" style={{ color: "var(--text-3)" }}>{label}</div>
        <div className="font-display font-bold text-lg mono-value leading-tight mt-0.5" style={{ color: "var(--text-1)" }}>
          {value}
        </div>
      </div>
    </div>
  );
}

export default function UserDetailPage() {
  const { user_id } = useParams<{ user_id: string }>();
  const router      = useRouter();

  const [user,    setUser]    = useState<UserAdminOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState<string | null>(null);
  const [busy,            setBusy]            = useState(false);
  const [actionErr,       setActionErr]       = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const u = await usersApi.get(user_id);
      setUser(u);
    } catch (e) {
      setErr(e instanceof AdminApiError ? e.message : "Impossible de charger l'utilisateur");
    } finally {
      setLoading(false);
    }
  }, [user_id]);

  useEffect(() => { load(); }, [load]);

  async function toggleBan() {
    if (!user) return;
    setBusy(true);
    setActionErr(null);
    try {
      if (user.is_active) {
        await usersApi.ban(user.id, { reason: "Banni par admin" });
        setUser({ ...user, is_active: false });
      } else {
        await usersApi.unban(user.id);
        setUser({ ...user, is_active: true });
      }
    } catch (e) {
      setActionErr(e instanceof AdminApiError ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!user) return;
    setBusy(true);
    setActionErr(null);
    try {
      await usersApi.delete(user.id);
      router.push("/users");
    } catch (e) {
      setActionErr(e instanceof AdminApiError ? e.message : "Erreur");
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-3" style={{ color: "var(--text-3)" }}>
        <Loader2 className="w-4 h-4 animate-spin" />
        Chargement…
      </div>
    );
  }

  if (err || !user) {
    return (
      <div className="p-6 space-y-4">
        <button onClick={() => router.back()} className="btn-ghost btn-sm flex items-center gap-2">
          <ArrowLeft className="w-3.5 h-3.5" /> Retour
        </button>
        <div className="alert-danger flex items-center gap-2 text-sm">
          <AlertTriangle className="w-4 h-4" />
          {err ?? "Utilisateur introuvable"}
        </div>
      </div>
    );
  }

  const joined  = new Date(user.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const active  = user.is_active;

  return (
    <div className="p-6 space-y-5 max-w-4xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/users" className="btn-ghost btn-sm flex items-center gap-1.5">
            <ArrowLeft className="w-3.5 h-3.5" />
            Utilisateurs
          </Link>
          <span style={{ color: "var(--text-3)" }}>/</span>
          <span className="font-display text-xl font-bold truncate max-w-xs" style={{ color: "var(--text-1)" }}>
            {user.email}
          </span>
          <span
            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold"
            style={{
              background: active ? "var(--signal-ok-dim)"     : "var(--signal-danger-dim)",
              border:     `1px solid ${active ? "var(--signal-ok-border)" : "var(--signal-danger-border)"}`,
              color:      active ? "var(--signal-ok)"         : "var(--signal-danger)",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: active ? "var(--signal-ok)" : "var(--signal-danger)" }}
            />
            {active ? "Actif" : "Banni"}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {actionErr && (
            <span className="text-xs" style={{ color: "var(--signal-danger)" }}>{actionErr}</span>
          )}
          <button onClick={load} disabled={loading} className="btn-ghost btn-sm">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={toggleBan}
            disabled={busy}
            className={active ? "btn-danger btn-sm" : "btn-success btn-sm"}
            style={{ padding: "5px 12px" }}
          >
            {busy
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
            {active ? "Bannir" : "Débannir"}
          </button>
          <button
            onClick={() => setShowDeleteModal(true)}
            disabled={busy}
            className="btn-ghost btn-sm"
            style={{ padding: "5px 10px", color: "var(--signal-danger)" }}
            title="Supprimer définitivement"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="flex gap-3 flex-wrap">
        <StatCard icon={Puzzle}      label="Plugins"    value={user.plugin_count}      accent="var(--xcore)" />
        <StatCard icon={ClipboardList} label="Soumissions" value={user.submission_count} accent="var(--text-2)" />
        <StatCard icon={KeyRound}    label="MFA"        value={user.mfa_enabled ? "Activé" : "Désactivé"} accent={user.mfa_enabled ? "var(--signal-ok)" : undefined} />
        <StatCard icon={Calendar}    label="Inscription" value={joined} />
      </div>

      {/* Details card */}
      <div className="panel p-5 space-y-5">
        <h2 className="font-display text-sm font-semibold" style={{ color: "var(--text-1)" }}>
          Informations du compte
        </h2>

        <div className="grid grid-cols-1 gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <div className="text-[11px] mb-1" style={{ color: "var(--text-3)" }}>ID</div>
            <div className="mono-value text-xs" style={{ color: "var(--text-2)" }}>{user.id}</div>
          </div>
          <div>
            <div className="text-[11px] mb-1" style={{ color: "var(--text-3)" }}>Email</div>
            <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-1)" }}>
              <Mail className="w-3 h-3" style={{ color: "var(--text-3)" }} />
              {user.email}
            </div>
          </div>
          <div>
            <div className="text-[11px] mb-1" style={{ color: "var(--text-3)" }}>Statut</div>
            <div
              className="text-xs font-semibold"
              style={{ color: active ? "var(--signal-ok)" : "var(--signal-danger)" }}
            >
              {active ? "Compte actif" : "Compte banni"}
            </div>
          </div>
          <div>
            <div className="text-[11px] mb-1" style={{ color: "var(--text-3)" }}>Authentification 2FA</div>
            <div
              className="text-xs font-semibold"
              style={{ color: user.mfa_enabled ? "var(--signal-ok)" : "var(--text-3)" }}
            >
              {user.mfa_enabled ? "MFA activé" : "MFA désactivé"}
            </div>
          </div>
          {user.github_login && (
            <div>
              <div className="text-[11px] mb-1" style={{ color: "var(--text-3)" }}>GitHub</div>
              <div className="flex items-center gap-1.5 text-xs mono-value" style={{ color: "var(--xcore)" }}>
                <Github className="w-3 h-3" />
                {user.github_login}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Roles card */}
      <div className="panel p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold" style={{ color: "var(--text-1)" }}>
            Rôles
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {user.roles.length > 0
            ? user.roles.map(r => <RoleBadge key={r} role={r} />)
            : <span className="text-xs" style={{ color: "var(--text-3)" }}>Aucun rôle assigné.</span>
          }
        </div>
      </div>

      {/* Danger zone */}
      <div
        className="panel p-5 space-y-3"
        style={{ borderColor: "var(--signal-danger-border)" }}
      >
        <h2 className="font-display text-sm font-semibold" style={{ color: "var(--signal-danger)" }}>
          Zone dangereuse
        </h2>
        <p className="text-xs" style={{ color: "var(--text-3)" }}>
          La suppression est irréversible. Tous les plugins et soumissions associés seront supprimés.
        </p>
        <button
          onClick={() => setShowDeleteModal(true)}
          disabled={busy}
          className="btn-danger btn-sm"
          style={{ padding: "6px 16px" }}
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          Supprimer ce compte
        </button>
      </div>

      {showDeleteModal && (
        <ConfirmDeleteModal
          email={user.email}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setShowDeleteModal(false)}
          busy={busy}
        />
      )}

    </div>
  );
}
