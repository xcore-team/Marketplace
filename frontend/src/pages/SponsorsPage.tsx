import React from 'react'

export default function SponsorsPage() {
  return (
    <div className="page">
      <div className="dash-header">
        <div className="dash-header__inner">
          <div className="section__label">Sponsors</div>
          <h1 className="dash-header__title dash-header__title--lg">
            Ils soutiennent <span className="gradient-text">l'innovation</span>
          </h1>
        </div>
      </div>
      <div className="section">
        <div className="markdown-body">
          <p>
            XCoreHub est un projet open-source qui repose sur le soutien de ses partenaires et de sa communauté. 
            Grâce à eux, nous pouvons maintenir une infrastructure gratuite et sécurisée pour tous.
          </p>
          
          <div className="card-grid" style={{ marginTop: 48, gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="card" style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.6, borderStyle: 'dashed' }}>
                <span className="text-faint">Partenaire {i}</span>
              </div>
            ))}
          </div>

          <h2 style={{ marginTop: 64 }}>Devenir Sponsor</h2>
          <p>
            Vous souhaitez soutenir le projet et gagner en visibilité auprès de la communauté XCore ? 
            Contactez-nous pour découvrir nos programmes de partenariat.
          </p>
          <button className="btn btn-primary mt-4">Nous contacter</button>
        </div>
      </div>
    </div>
  )
}
