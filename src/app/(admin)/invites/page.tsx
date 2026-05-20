"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  invitesApi, tenantsApi, rbacApi,
  type InviteResponse, type TenantResponse, type RoleResponse,
  AdminApiError,
} from "@/lib/admin-api";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import {
  RefreshCw, Plus, Copy, Check, Clock, UserCheck,
  AlertTriangle, Loader2, Mail, X,
} from "lucide-react";

function isExpired(invite: InviteResponse): boolean {
  return new Date(invite.expires_at) <= new Date();
}

// ── Invite row ────────────────────────────────────────────────────────────────

function InviteRow({ invite, roles }: { invite: InviteResponse; roles: RoleResponse[] }) {
  const [copied, copy] = useCopyToClipboard();

  const role = roles.find(r => r.id === invite.role_id);
  const expired = isExpired(invite);
  const expiresLabel = new Date(invite.expires_at).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric",
  });

  let statusColor = "var(--signal-ok)";
  let statusBg = "var(--signal-ok-dim)";
  let statusBorder = "var(--signal-ok-border)";
  let statusLabel = "Active";

  if (invite.used_at) {
    statusColor = "var(--text-3)";
    statusBg = "var(--surface-2)";
    statusBorder = "var(--border)";
    statusLabel = "Acceptée";
  } else if (expired || !invite.is_active) {
    statusColor = "var(--signal-danger)";
    statusBg = "var(--signal-danger-dim)";
    statusBorder = "var(--signal-danger-border)";
    statusLabel = "Expirée";
  }

  return (
    <div
      className="flex items-center gap-4 px-4 py-3 text-sm"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Mail className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--text-3)" }} />
        <span className="truncate" style={{ color: "var(--text-1)" }}>{invite.email}</span>
      </div>

      <div className="w-32 flex-shrink-0">
        {role ? (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] mono-value font-semibold"
            style={{ background: "var(--xcore-dim)", color: "var(--xcore)", border: "1px solid var(--xcore-glow)" }}
          >
            {role.name}
          </span>
        ) : (
          <span className="text-xs" style={{ color: "var(--text-3)" }}>—</span>
        )}
      </div>

      <div className="w-28 flex-shrink-0 flex items-center gap-1">
        <Clock className="w-3 h-3" style={{ color: "var(--text-3)" }} />
        <span className="text-xs" style={{ color: "var(--text-3)" }}>{expiresLabel}</span>
      </div>

      <div className="w-24 flex-shrink-0">
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold"
          style={{ background: statusBg, color: statusColor, border: `1px solid ${statusBorder}` }}
        >
          {invite.used_at
            ? <UserCheck className="w-2.5 h-2.5" />
            : expired
              ? <X className="w-2.5 h-2.5" />
              : <Check className="w-2.5 h-2.5" />}
          {statusLabel}
        </span>
      </div>

      {!invite.used_at && !expired && invite.is_active && (
        <button
          onClick={() => copy(invite.token)}
          className="flex items-center gap-1 text-[11px] transition-colors flex-shrink-0"
          style={{ color: copied ? "var(--signal-ok)" : "var(--text-3)" }}
          title="Copier le lien d'invitation"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  );
}

// ── Create form ───────────────────────────────────────────────────────────────

function CreateInviteForm({
  tenantId,
  roles,
  onCreated,
}: {
  tenantId: string;
  roles: RoleResponse[];
  onCreated: (invite: InviteResponse) => void;
}) {
  const [email,  setEmail]  = useState("");
  const [roleId, setRoleId] = useState("");
  const [hours,  setHours]  = useState(72);
  const [busy,   setBusy]   = useState(false);
  const [err,    setErr]    = useState<string | null>(null);
  const [done,   setDone]   = useState(false);
  const doneTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(doneTimerRef.current), []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const invite = await invitesApi.create({
        tenant_id: tenantId,
        email: email.trim(),
        role_id: roleId || undefined,
        expires_hours: hours,
      });
      onCreated(invite);
      setEmail("");
      setRoleId("");
      setHours(72);
      setDone(true);
      doneTimerRef.current = setTimeout(() => setDone(false), 2000);
    } catch (e) {
      setErr(e instanceof AdminApiError ? e.message : "Erreur lors de la création");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {err && (
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--signal-danger)" }}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {err}
        </div>
      )}

      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr auto" }}>
        <div>
          <label className="block text-[11px] mb-1" style={{ color: "var(--text-3)" }}>
            Email *
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="admin@exemple.com"
            required
            className="input text-sm"
          />
        </div>

        <div>
          <label className="block text-[11px] mb-1" style={{ color: "var(--text-3)" }}>
            Rôle
          </label>
          <select
            value={roleId}
            onChange={e => setRoleId(e.target.value)}
            className="input text-sm"
            style={{ color: roleId ? "var(--text-1)" : "var(--text-3)" }}
          >
            <option value="">— Aucun rôle —</option>
            {roles.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] mb-1" style={{ color: "var(--text-3)" }}>
            Expire dans
          </label>
          <select
            value={hours}
            onChange={e => setHours(Number(e.target.value))}
            className="input text-sm"
          >
            <option value={24}>24h</option>
            <option value={48}>48h</option>
            <option value={72}>72h</option>
            <option value={168}>7 jours</option>
          </select>
        </div>
      </div>

      <button
        type="submit"
        disabled={busy || !email.trim()}
        className="btn-primary flex items-center gap-2"
        style={{ padding: "7px 16px" }}
      >
        {busy
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : done
            ? <Check className="w-3.5 h-3.5" />
            : <Plus className="w-3.5 h-3.5" />}
        {done ? "Invitation envoyée" : "Envoyer l'invitation"}
      </button>
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InvitesPage() {
  const [invites,  setInvites]  = useState<InviteResponse[]>([]);
  const [tenants,  setTenants]  = useState<TenantResponse[]>([]);
  const [roles,    setRoles]    = useState<RoleResponse[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [err,      setErr]      = useState<string | null>(null);

  const tenantId = tenants[0]?.id ?? "";

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [tenantsRes, rolesRes] = await Promise.all([
        tenantsApi.list(),
        rbacApi.listRoles(),
      ]);
      setTenants(tenantsRes);
      setRoles(rolesRes);

      if (tenantsRes[0]) {
        const invitesRes = await invitesApi.list(tenantsRes[0].id);
        setInvites(invitesRes);
      }
    } catch (e) {
      setErr(e instanceof AdminApiError ? e.message : "Impossible de charger les invitations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleCreated(invite: InviteResponse) {
    setInvites(prev => [invite, ...prev]);
  }

  const active   = invites.filter(i => i.is_active && !i.used_at && !isExpired(i));
  const inactive = invites.filter(i => !i.is_active || i.used_at || isExpired(i));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span className="page-title-prefix">/</span>
            Invitations
          </h1>
          <p className="mono-value mt-1" style={{ fontSize: 10, color: "var(--text-3)" }}>
            Invitez des collaborateurs — création de compte par email.
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn-ghost btn-sm">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

    <div className="page-content space-y-5" style={{ maxWidth: 720 }}>

      {tenantId && (
        <div className="panel p-6 space-y-4">
          <h2 className="font-display text-sm font-semibold" style={{ color: "var(--text-1)" }}>
            Nouvelle invitation
          </h2>
          <CreateInviteForm tenantId={tenantId} roles={roles} onCreated={handleCreated} />
        </div>
      )}

      {err && (
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--signal-danger)" }}>
          <AlertTriangle className="w-4 h-4" /> {err}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-3" style={{ color: "var(--text-3)" }}>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Chargement…</span>
        </div>
      )}

      {!loading && active.length > 0 && (
        <div className="panel overflow-hidden">
          <div
            className="px-4 py-3 flex items-center justify-between"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <h2 className="font-display text-sm font-semibold" style={{ color: "var(--text-1)" }}>
              Invitations actives
            </h2>
            <span
              className="mono-value text-[11px] px-2 py-0.5 rounded"
              style={{ background: "var(--signal-ok-dim)", color: "var(--signal-ok)", border: "1px solid var(--signal-ok-border)" }}
            >
              {active.length}
            </span>
          </div>
          <div className="text-[11px] px-4 py-2 grid"
            style={{ gridTemplateColumns: "1fr 128px 112px 96px 28px", color: "var(--text-3)", borderBottom: "1px solid var(--border)" }}>
            <span>Email</span>
            <span>Rôle</span>
            <span>Expire</span>
            <span>Statut</span>
            <span />
          </div>
          {active.map(inv => (
            <InviteRow key={inv.id} invite={inv} roles={roles} />
          ))}
        </div>
      )}

      {!loading && inactive.length > 0 && (
        <div className="panel overflow-hidden">
          <div
            className="px-4 py-3"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <h2 className="font-display text-sm font-semibold" style={{ color: "var(--text-3)" }}>
              Historique
            </h2>
          </div>
          {inactive.map(inv => (
            <InviteRow key={inv.id} invite={inv} roles={roles} />
          ))}
        </div>
      )}

      {!loading && invites.length === 0 && !err && (
        <div className="panel p-8 flex flex-col items-center gap-3">
          <Mail className="w-8 h-8" style={{ color: "var(--text-3)" }} />
          <p className="text-sm" style={{ color: "var(--text-3)" }}>
            Aucune invitation envoyée.
          </p>
        </div>
      )}

    </div>{/* /page-content */}
    </div>
  );
}
