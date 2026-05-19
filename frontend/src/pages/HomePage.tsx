import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  Lock, Database, BarChart2, Palette, CreditCard, Mail, Link,
  HardDrive, Shield, Bell, Activity, Bot, Plug,
} from 'lucide-react'
import { plugins as pluginsApi, categories as catsApi } from '../api'
import PluginCard from '../components/PluginCard'
import { PluginCardSkeleton } from '../components/Skeleton'
import type { Category, PagedResponse, Plugin } from '../types'

const CAT_ICONS: Record<string, LucideIcon> = {
  auth: Lock, database: Database, analytics: BarChart2, ui: Palette,
  payment: CreditCard, email: Mail, api: Link, storage: HardDrive,
  security: Shield, notification: Bell, monitoring: Activity, ai: Bot,
  default: Plug,
}

export default function HomePage() {
  const navigate = useNavigate()

  const { data: pluginsData, isLoading: pluginsLoading } = useQuery({
    queryKey: ['plugins', 'featured'],
    queryFn: () => pluginsApi.list({ limit: 6 }),
  })

  const { data: catsData } = useQuery({
    queryKey: ['categories'],
    queryFn: catsApi.list,
  })

  const items: Plugin[] = (pluginsData as PagedResponse<Plugin>)?.items ?? []
  const total = (pluginsData as PagedResponse<Plugin>)?.total ?? 0
  const cats: Category[] = Array.isArray(catsData) ? catsData : (catsData as PagedResponse<Category>)?.items ?? []

  return (
    <div>
      {/* ── Hero ── */}
      <div className="hero">
        <div className="hero__bg" />
        <div className="hero__grid" />

        <div className="hero__content">
          <div className="hero__left">
            <div className="hero__label">
              <div className="hero__label-dot" />
              L'écosystème centralisé XCore
            </div>

            <h1 className="hero__title">
              Boostez votre
              <br />
              <span className="gradient-text">infrastructure</span>
              <br />
              avec XCoreHub
            </h1>

            <p className="hero__subtitle">
              Le point d'entrée unique pour découvrir, déployer et gérer vos extensions XCore.
              Sécurité native, validation automatisée et intégration transparente.
            </p>

            <div className="hero__actions">
              <button className="btn btn-primary btn-lg" onClick={() => navigate('/plugins')}>
                Explorer le Hub →
              </button>
              <button className="btn btn-secondary btn-lg" onClick={() => navigate('/dashboard')}>
                Devenir contributeur
              </button>
            </div>

            <div className="hero__stats">
              <div>
                <div className="hero__stat-val">{total > 0 ? `${total}` : '24+'}</div>
                <div className="hero__stat-label">Modules actifs</div>
              </div>
              <div>
                <div className="hero__stat-val">{cats.length > 0 ? `${cats.length}` : '12'}</div>
                <div className="hero__stat-label">Catégories</div>
              </div>
              <div>
                <div className="hero__stat-val">100%</div>
                <div className="hero__stat-label">Vérifié par Pipeline</div>
              </div>
            </div>
          </div>

          {/* Mascot */}
          <div className="hero__mascot-wrap">
            <div className="hero__mascot-ring" />
            <img src="/mascot.svg" alt="XCore mascot" className="hero__mascot" />
          </div>
        </div>
      </div>

      {/* ── Featured Plugins ── */}
      <div style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div className="section">
          <div className="section__header">
            <div>
              <div className="section__label">Découverte</div>
              <h2 className="section__title">Extensions Populaires</h2>
            </div>
            <button className="btn btn-secondary" onClick={() => navigate('/plugins')}>
              Voir tout le catalogue →
            </button>
          </div>

          <div className="plugins-grid">
            {pluginsLoading
              ? Array.from({ length: 6 }, (_, i) => <PluginCardSkeleton key={i} />)
              : items.length > 0
                ? items.map((p, i) => <PluginCard key={p.id} plugin={p} delay={i * 60} />)
                : (
                  <div className="empty" style={{ gridColumn: '1/-1' }}>
                    <img src="/mascot.svg" alt="" style={{ width: 80, margin: '0 auto 16px', opacity: 0.5 }} />
                    <div className="empty__title">Le Hub est en pleine expansion</div>
                    <div className="empty__text">Soyez parmi les premiers à enrichir l'écosystème XCoreHub.</div>
                    <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
                      Publier mon premier module
                    </button>
                  </div>
                )
            }
          </div>
        </div>
      </div>

      {/* ── Categories ── */}
      {cats.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <div className="section">
            <div className="section__header">
              <div>
                <div className="section__label">Navigation</div>
                <h2 className="section__title">Parcourir par Domaine</h2>
              </div>
            </div>
            <div className="cat-grid">
              {cats.map((cat) => (
                <div
                  key={cat.id}
                  className="cat-card"
                  onClick={() => navigate(`/plugins?category=${cat.id}`)}
                >
                  <div className="cat-card__icon">
                    {(() => { const Icon = CAT_ICONS[cat.name?.toLowerCase()] ?? CAT_ICONS.default; return <Icon size={22} strokeWidth={1.5} /> })()}
                  </div>
                  <div className="cat-card__name">{cat.name}</div>
                  {cat.plugin_count != null && (
                    <div className="cat-card__count">{cat.plugin_count} module{cat.plugin_count !== 1 ? 's' : ''}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── CTA Banner ── */}
      <div style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div className="section">
          <div className="cta-banner">
            <div className="section__label" style={{ marginBottom: 16 }}>Build with us</div>
            <h2
              className="font-display font-bold"
              style={{ fontSize: 'clamp(28px, 4vw, 48px)', letterSpacing: '-0.03em', marginBottom: 16 }}
            >
              Étendez les capacités de <span className="gradient-text">XCoreHub</span>
            </h2>
            <p style={{ color: 'var(--text2)', maxWidth: 480, margin: '0 auto 32px', lineHeight: 1.7 }}>
              Rejoignez notre communauté de développeurs. Profitez d'un déploiement 
              sécurisé et d'une visibilité maximale pour vos outils.
            </p>
            <div className="flex gap-3 items-center" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-lg" onClick={() => navigate('/dashboard')}>
                Commencer à développer
              </button>
              <button className="btn btn-secondary btn-lg" onClick={() => navigate('/plugins')}>
                Consulter la documentation
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="footer__inner">
          <div className="footer__logo">
            <img src="/mascot.svg" alt="" style={{ width: 24, height: 24 }} />
            <span className="gradient-text">XCore</span>
            <span>Hub</span>
          </div>
          <div style={{ color: 'var(--text3)', fontSize: 12 }}>
            La plateforme d'extension unifiée pour XCore
          </div>
          <div className="flex gap-4 text-sm text-faint" style={{ flexWrap: 'wrap' }}>
            <span onClick={() => navigate('/plugins')} style={{ cursor: 'pointer', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--acc)')}
              onMouseLeave={e => (e.currentTarget.style.color = '')}>
              Catalogue
            </span>
            <span onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--acc)')}
              onMouseLeave={e => (e.currentTarget.style.color = '')}>
              Contributeur
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}
