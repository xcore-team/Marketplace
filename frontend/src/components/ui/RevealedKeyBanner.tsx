import { useState } from 'react'
import { AlertTriangle, Check, Copy } from 'lucide-react'
import Panel from './Panel'
import type { ApiKeyCreated } from '../../types'

/** Reveal-once banner for a freshly created xdevkeys API key — shared between
 * the Deployments page (agent xdevkey / deployment_credential) and the
 * Atelier submit panel (CI/CD XCORE_API_KEY secret). The backend never
 * returns `created.key` again after this response, so this is the only
 * chance the user gets to copy it. */
export default function RevealedKeyBanner({
  created,
  projectName,
  onDismiss,
}: {
  created: ApiKeyCreated
  projectName: string
  onDismiss: () => void
}) {
  const [copiedKey, setCopiedKey] = useState(false)
  const [copiedCred, setCopiedCred] = useState(false)
  const copy = async (value: string, setCopied: (v: boolean) => void) => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <Panel
      className="mb-4"
      title={
        <span className="flex items-center gap-2">
          <AlertTriangle size={14} style={{ color: 'var(--warning)' }} /> Clé du projet « {projectName} » créée
        </span>
      }
    >
      <p className="text-xs text-muted mb-3">
        Copiez {created.deployment_credential ? 'ces valeurs' : 'cette clé'} maintenant —{' '}
        {created.deployment_credential ? 'elles ne seront plus jamais affichées' : 'elle ne sera plus jamais affichée'}. Configurez-
        {created.deployment_credential ? 'les' : 'la'} dans votre agent XCore
        {created.deployment_credential ? (
          <>
            {' '}
            (<code className="text-acc">--xdevkey</code> et <code className="text-acc">--deployment-credential</code>)
          </>
        ) : (
          <>
            {' '}
            (en-tête <code className="text-acc">X-API-Key</code>)
          </>
        )}{' '}
        pour la cible de ce projet.
      </p>
      <div className="input-label" style={{ marginBottom: 4 }}>xdevkey</div>
      <div className="flex items-center gap-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '10px 12px' }}>
        <code className="font-mono text-sm" style={{ flex: 1, overflowX: 'auto', whiteSpace: 'nowrap' }}>{created.key}</code>
        <button className="btn btn-secondary btn-sm" onClick={() => copy(created.key, setCopiedKey)}>
          {copiedKey ? <><Check size={13} /> Copié</> : <><Copy size={13} /> Copier</>}
        </button>
      </div>
      {created.deployment_credential && (
        <>
          <div className="input-label" style={{ marginTop: 12, marginBottom: 4 }}>deployment_credential</div>
          <div className="flex items-center gap-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '10px 12px' }}>
            <code className="font-mono text-sm" style={{ flex: 1, overflowX: 'auto', whiteSpace: 'nowrap' }}>{created.deployment_credential}</code>
            <button className="btn btn-secondary btn-sm" onClick={() => copy(created.deployment_credential!, setCopiedCred)}>
              {copiedCred ? <><Check size={13} /> Copié</> : <><Copy size={13} /> Copier</>}
            </button>
          </div>
        </>
      )}
      <button className="btn btn-ghost btn-sm mt-3" onClick={onDismiss}>
        J'ai copié {created.deployment_credential ? 'les valeurs' : 'la clé'}, masquer
      </button>
    </Panel>
  )
}
