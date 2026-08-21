import React from 'react'

export default function VisionPage() {
  return (
    <div className="page">
      <div className="dash-header">
        <div className="dash-header__inner">
          <div className="section__label">Futur & Évolution</div>
          <h1 className="dash-header__title dash-header__title--lg">
            L'horizon <span className="gradient-text">XCore 4.0</span>
          </h1>
        </div>
      </div>
      <div className="section">
        <div className="markdown-body">
          <p>
            L'évolution de XCore suit un fil directeur immuable : <strong>les plugins existants ne changent pas</strong>. 
            L'innovation se fait dans le kernel et les services, sans jamais briser le contrat avec les développeurs.
          </p>

          <div className="card-grid" style={{ margin: '48px 0' }}>
            {/* Axe 1 */}
            <div className="card">
              <div className="badge badge-acc mb-4">Axe 1</div>
              <h3 style={{ marginTop: 0 }}>Multi-tenancy Natif</h3>
              <p className="text-sm">Isolation des données au niveau du kernel. Chaque service s'adapte automatiquement au contexte du locataire (Tenant).</p>
            </div>

            {/* Axe 2 */}
            <div className="card">
              <div className="badge badge-acc mb-4">Axe 2</div>
              <h3 style={{ marginTop: 0 }}>Plugin Federation</h3>
              <p className="text-sm">Le Monolithe Modulaire devient un Cluster Distribué. Appelez des plugins distants comme s'ils étaient locaux.</p>
            </div>

            {/* Axe 3 */}
            <div className="card">
              <div className="badge badge-acc mb-4">Axe 3</div>
              <h3 style={{ marginTop: 0 }}>Schema Registry</h3>
              <p className="text-sm">Validation stricte des contrats entre plugins. Détection des breaking changes avant la mise en production.</p>
            </div>

            {/* Axe 4 */}
            <div className="card">
              <div className="badge badge-acc mb-4">Axe 4</div>
              <h3 style={{ marginTop: 0 }}>Agents IA (AgentBase)</h3>
              <p className="text-sm">Intégration native des LLM. Transformez vos plugins en outils (Tools) orchestrés par le langage naturel.</p>
            </div>

            {/* Axe 5 */}
            <div className="card">
              <div className="badge badge-acc mb-4">Axe 5</div>
              <h3 style={{ marginTop: 0 }}>Hot-swap de Services</h3>
              <p className="text-sm">Basculez entre Redis, PostgreSQL ou S3 sans redémarrage et sans perte de requêtes.</p>
            </div>

            {/* Axe 6 */}
            <div className="card">
              <div className="badge badge-acc mb-4">Axe 6</div>
              <h3 style={{ marginTop: 0 }}>Composition (Traits)</h3>
              <p className="text-sm">Réutilisez la logique métier via des Traits explicites plutôt que par héritage profond.</p>
            </div>

            {/* Axe 7 */}
            <div className="card">
              <div className="badge badge-acc mb-4">Axe 7</div>
              <h3 style={{ marginTop: 0 }}>Observabilité Native</h3>
              <p className="text-sm">Intégration OpenTelemetry automatique. Traces complètes de chaque événement et appel IPC.</p>
            </div>

            {/* Axe 8 */}
            <div className="card">
              <div className="badge badge-acc mb-4">Axe 8</div>
              <h3 style={{ marginTop: 0 }}>Écosystème Hub</h3>
              <p className="text-sm">Faire de XCoreHub le hub central mondial pour les briques d'infrastructure prêtes à l'emploi.</p>
            </div>
          </div>

          <h2>Feuille de route stratégique</h2>
          <div style={{ position: 'relative', paddingLeft: 32, borderLeft: '2px solid var(--border)', margin: '40px 0' }}>
            <div style={{ marginBottom: 32 }}>
              <div className="badge badge-success mb-2">Court terme (v2.x)</div>
              <p className="text-sm">Focus sur l'<strong>Observabilité</strong> et le <strong>Schema Registry</strong> pour renforcer la stabilité opérationnelle.</p>
            </div>
            <div style={{ marginBottom: 32 }}>
              <div className="badge badge-warning mb-2">Moyen terme (v3.x)</div>
              <p className="text-sm">Introduction du <strong>Multi-tenancy</strong> et des <strong>Agents IA</strong> pour répondre aux besoins SaaS modernes.</p>
            </div>
            <div>
              <div className="badge badge-ghost mb-2">Long terme (v4.x)</div>
              <p className="text-sm">Déploiement de la <strong>Fédération de plugins</strong> pour une scalabilité horizontale infinie.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
