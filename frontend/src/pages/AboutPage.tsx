import React from 'react'

export default function AboutPage() {
  return (
    <div className="page">
      <div className="section">
        <div className="section__label">L'ADN XCore</div>
        <h1 className="hero__title" style={{ fontSize: 'clamp(32px, 5vw, 64px)', marginBottom: 32 }}>
          L'excellence <span className="gradient-text">modulaire</span>
        </h1>
        <div className="markdown-body">
          <p className="lead" style={{ fontSize: '1.2em', color: 'var(--text)' }}>
            "Un framework évolue dans son domaine quand il anticipe les besoins de ses utilisateurs avant qu'ils les formulent."
          </p>
          
          <p>
            XCore est né d'un constat simple : la complexité des microservices est souvent un frein à l'innovation, 
            mais le monolithe traditionnel est un piège à dette technique. Notre réponse est le <strong>Monolithe Modulaire</strong>.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 24, margin: '40px 0' }}>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Noyau Minimal</h3>
              <p className="text-sm">Un kernel ultra-léger qui ne fait qu'une chose : orchestrer les cycles de vie et les communications.</p>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Isolation Totale</h3>
              <p className="text-sm">Deux plugins ne se connaissent jamais directement. Ils communiquent via un bus d'événements ou un IPC arbitré.</p>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Extensibilité Maximale</h3>
              <p className="text-sm">Tout est un plugin. De l'authentification au moteur de rendu, chaque brique est interchangeable sans downtime.</p>
            </div>
          </div>

          <h2>Le rôle de XCoreHub</h2>
          <p>
            <strong>XCoreHub</strong> n'est pas qu'un simple catalogue. C'est la couche de confiance de l'écosystème. 
            Il garantit que chaque extension respecte les contrats d'isolation et de performance via un pipeline 
            de validation unique au monde, combinant analyse statique et exécution en sandbox.
          </p>

          <blockquote>
            Notre mission est de supprimer la plomberie technique pour laisser les développeurs 
            se concentrer sur la valeur métier de leurs plugins.
          </blockquote>
        </div>
      </div>
    </div>
  )
}
