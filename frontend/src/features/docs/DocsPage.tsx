import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { BookOpen } from 'lucide-react'
import { DOC_SECTIONS } from './content'

/** In-app publishing/CI-CD/deploy/install guide — this is documentation
 * content, not data from the backend, so it lives entirely in
 * `content.ts` and is rendered client-side. Reuses the dashboard's
 * sidebar-shell pattern (`.dash-shell`/`.dash-sidebar*`) for the section
 * nav, and the same `.markdown-body` rendering already used for
 * plugin/service README tabs. */
export default function DocsPage() {
  const navigate = useNavigate()
  const { section } = useParams<{ section?: string }>()
  const [active, setActive] = useState(section && DOC_SECTIONS.some((s) => s.id === section) ? section : DOC_SECTIONS[0].id)

  useEffect(() => {
    if (section && DOC_SECTIONS.some((s) => s.id === section)) {
      setActive(section)
    }
  }, [section])

  const go = (id: string) => {
    setActive(id)
    navigate(`/docs/${id}`)
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }

  const current = DOC_SECTIONS.find((s) => s.id === active) ?? DOC_SECTIONS[0]

  return (
    <div className="page">
      <div className="dash-header">
        <div className="dash-header__inner">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
            <div style={{ flex: 1 }}>
              <div className="section__label">Guide</div>
              <h1 className="dash-header__title">
                <span className="gradient-text">Documentation</span>
              </h1>
              <p className="dash-header__sub">
                Publier un plugin ou un service, automatiser avec la CI/CD, empaqueter et déployer avec{' '}
                <strong style={{ color: 'var(--acc)' }}>xcore-agent</strong>, installer localement via le Hub.
              </p>
            </div>
            <BookOpen size={40} strokeWidth={1.5} style={{ opacity: 0.5, flexShrink: 0, marginTop: 8 }} />
          </div>
        </div>
      </div>

      <div className="dash-shell">
        <aside className="dash-sidebar">
          <nav className="dash-sidebar__nav">
            {DOC_SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`dash-sidebar__item${active === s.id ? ' active' : ''}`}
                onClick={() => go(s.id)}
              >
                {s.label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="panel">
          <div className="panel__body">
            <div className="markdown-body">
              <ReactMarkdown>{current.content}</ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
