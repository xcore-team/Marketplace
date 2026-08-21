export interface DocSection {
  id: string
  label: string
  title: string
  content: string
}

export const DOC_SECTIONS: DocSection[] = [
  {
    id: 'publish-plugin',
    label: 'Publier un plugin',
    title: 'Publier un plugin',
    content: `
Un plugin publié sur XCoreHub vient **toujours d'un tag Git existant** — jamais d'un ZIP local uploadé à la main pour la voie GitHub (l'upload direct reste possible mais n'a pas de suivi de version automatique). Voici ce qu'il faut avant de commencer, puis les étapes.

## Prérequis

1. **Un dépôt GitHub** contenant un \`plugin.yaml\` à la racine (ou dans un sous-dossier à un seul niveau — le premier trouvé, le moins imbriqué, est utilisé).
2. **Un compte GitHub lié** à XCoreHub avec le scope \`repo\` (voir plus bas).
3. **Un tag Git** correspondant exactement à la version que vous publiez — \`1.0.0\` ou \`v1.0.0\`, les deux formes sont acceptées et doivent correspondre au champ \`version\` de \`plugin.yaml\`.

### Structure minimale de \`plugin.yaml\`

\`\`\`yaml
name: mon-plugin
version: 1.0.0
author: votre-nom
description: >
  Une description claire de ce que fait le plugin.

execution_mode: sandboxed   # ou "trusted" pour un plugin signé par l'hôte
entry_point: src/main.py
framework_version: ">=2.0.0"
\`\`\`

Champs optionnels utiles : \`homepage\`, \`repository\` (repris automatiquement depuis le repo GitHub soumis si absent), \`permissions\`, \`resources\` (limites CPU/mémoire/timeout), \`runtime.health_check\`.

## Étapes

1. **Atelier → Soumettre.** Si votre compte GitHub n'est pas encore lié, cliquez sur *Lier via GitHub* (OAuth, demande le scope \`repo\` en plus d'une connexion existante) — ou *Lier avec un Personal Access Token* si votre organisation restreint les apps OAuth.
2. La liste ne montre que les dépôts contenant un \`plugin.yaml\` à la racine.
3. Choisissez un **tag Git** existant dans la liste déroulante (générée depuis les vrais tags du dépôt) — la **version cible** se pré-remplit avec le tag, sans le préfixe \`v\`.
4. Choisissez les catégories et la visibilité (public / privé — un plugin privé n'est visible que par vous et votre équipe).
5. *Lancer la publication* → réponse immédiate \`202\`, le pipeline tourne en tâche de fond. Suivez la progression dans **Mes plugins**, ou via la notification en temps réel.

## Ce qui se passe ensuite

Le ZIP est téléchargé depuis GitHub au tag exact, puis passe par le **pipeline de sécurité en 11 gates** (analyse statique, dépendances, secrets, sandbox, comportement, signature, licence, santé des dépendances, appels HTTP, exécution sandboxée). Le score total détermine le sort de la soumission :

| Score | Résultat |
|---|---|
| < 20 | Publié automatiquement |
| 20 – 79 | Envoyé en révision manuelle |
| ≥ 80 | Rejeté automatiquement |

Le détail gate par gate (avec chaque finding, sa gravité, et la remédiation suggérée) est consultable en dépliant la soumission dans **Mes plugins**, ou depuis la page de gestion du plugin (icône ⚙).

## Republier une mise à jour

Poussez un nouveau tag Git avec un \`plugin.yaml\` dont la \`version\` a été incrémentée, puis repassez par *Soumettre* — ou automatisez complètement ce cycle avec le **CI/CD** (section suivante) pour ne plus jamais avoir à repasser par ce formulaire.
`,
  },
  {
    id: 'publish-service',
    label: 'Publier un service',
    title: 'Publier un service (extension)',
    content: `
Un **service** (ou « extension ») est une dépendance qu'un plugin peut déclarer — base de données, cache, file de messages, etc. Le circuit de publication est **identique** à celui d'un plugin (même pipeline en 11 gates, même exigence de tag Git), seul le manifeste change.

## Prérequis

1. Un dépôt GitHub avec un **\`service.yaml\`** à la racine (au lieu de \`plugin.yaml\`).
2. Le même compte GitHub lié que pour les plugins — pas besoin de le relier une seconde fois.
3. Un tag Git correspondant à la \`version\` du manifeste.

### Structure minimale de \`service.yaml\`

\`\`\`yaml
name: mon-service
version: 1.0.0
entry_class: MonService   # classe d'entrée du service
description: >
  Ce que fait ce service et pourquoi un plugin en aurait besoin.
\`\`\`

## Étapes

1. **Atelier → Services.**
2. La liste des dépôts est filtrée sur \`service.yaml\` (comme les plugins le sont sur \`plugin.yaml\`) — un même dépôt ne peut pas être proposé pour les deux à moins de contenir les deux fichiers.
3. Choisissez le tag Git, la version cible, les catégories, la visibilité.
4. *Lancer la publication.*

Contrairement à un plugin, il n'y a **pas de \`POST\` de création dédié** : un service est créé implicitement à la première soumission réussie. Les soumissions suivantes sous le même nom mettent simplement à jour ce même service (nouvelle version).

## Suivre et gérer un service publié

Depuis **Atelier → Services**, chaque service publié affiche un bouton ⚙ *Réglages avancés* — même page de gestion complète que pour un plugin : métadonnées, versions, historique des soumissions avec le détail des gates (dépliable), panneau CI/CD, statistiques.
`,
  },
  {
    id: 'ci-cd',
    label: 'CI/CD',
    title: 'Configurer le CI/CD',
    content: `
Une fois qu'un plugin ou un service a déjà été publié une première fois, vous pouvez automatiser toutes les publications suivantes : un simple \`git push --tags\` republie automatiquement sur le Hub, sans repasser par l'interface.

## Où le trouver

Deux endroits, selon le moment :

- **Pendant une nouvelle soumission** (Atelier → Soumettre / Services) : le panneau *CI/CD* apparaît une fois un dépôt sélectionné.
- **Pour un plugin/service déjà publié** : bouton ⚙ *Réglages avancés* sur sa carte (Mes plugins / Mes services), section CI/CD sur la page qui s'ouvre.

## Étape 1 — Créer une clé API pour la CI

Cliquez sur *Créer une clé pour ce repo*. Cela crée (ou réutilise) un projet \`xdevkeys\` et vous révèle **une seule fois** une clé \`xdk_...\` — copiez-la immédiatement, elle ne sera plus jamais affichée.

Stockez-la comme **secret de dépôt GitHub** nommé \`XCORE_API_KEY\` : *Settings → Secrets and variables → Actions → New repository secret*.

> Cette clé n'a besoin d'être rattachée à aucun projet précis pour fonctionner ici — n'importe quelle clé API active de votre compte suffit pour republier via CI (contrairement à une clé utilisée pour *installer* un plugin, qui doit correspondre exactement au projet ciblé).

## Étape 2 — Ajouter le workflow GitHub Actions

Le bouton *Copier* récupère le YAML généré, prêt à coller dans \`.github/workflows/xcore-publish.yml\` de votre dépôt :

\`\`\`yaml
name: Publish to xcore marketplace

on:
  push:
    tags:
      - "*"

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - name: Notify xcore marketplace
        run: |
          TAG="\${GITHUB_REF_NAME}"
          curl -sS -X POST \\\\
            -H "X-API-Key: \${{ secrets.XCORE_API_KEY }}" \\\\
            "\${XCORE_MARKETPLACE_URL:-https://marketplace.xcorehub.dev}/app/marketplace/github/repos/OWNER/REPO/tags/$TAG/recompute" \\\\
            --fail-with-body
\`\`\`

Pour un **service**, le même mécanisme pointe vers \`/app/xservices/github/repos/OWNER/REPO/tags/$TAG/recompute\` à la place — le bouton génère automatiquement la bonne URL selon que vous êtes sur le panneau plugin ou service.

## Étape 3 — Pousser un tag

\`\`\`bash
# plugin.yaml (ou service.yaml) : incrémentez version: avant de taguer
git tag v1.2.3
git push origin v1.2.3
\`\`\`

Le workflow se déclenche, appelle \`recompute\`, qui retélécharge le ZIP à ce tag exact et relance le pipeline complet — exactement comme une soumission manuelle.

## Rejouer un tag déjà publié

C'est **prévu et sûr** : si le contenu n'a pas changé (même tag, même commit), c'est un no-op silencieux — utile si votre CI retente un job en échec pour une autre raison. En revanche, republier un **numéro de version déjà utilisé avec un contenu différent** est refusé explicitement (avec un message clair) plutôt qu'accepté silencieusement — un signe presque toujours d'un oubli d'incrémenter la version.
`,
  },
  {
    id: 'xdeploy-publish',
    label: 'Publier un .xdeploy',
    title: 'Publier un artefact .xdeploy avec xcore-agent',
    content: `
Le circuit \`.xdeploy\` est **distinct** de la publication marketplace décrite plus haut : il sert à empaqueter et chiffrer de bout en bout un **bundle multi-composants** (plusieurs plugins/extensions ensemble), jamais lisible par le Hub lui-même. C'est l'outil \`xcore-agent\` (CLI séparée, pas ce site web) qui fait tout le travail.

## Prérequis

1. **\`xcore-agent\` installé** localement (\`pip install xcore-agent\` ou équivalent selon votre environnement).
2. Un **projet de déploiement** de type \`xdeploy\` créé sur **Déploiements → Projets & clés** — l'identifiant (\`prj_...\`) est généré automatiquement, pas de slug à choisir.
3. Une **clé API pour ce projet** — révélée une fois à la création, avec en plus (spécifique aux projets \`xdeploy\`) un **\`deployment_credential\`**, un second secret distinct de la clé elle-même.
4. Un arbre source local avec \`plugins/\`, \`integration.yaml\`, et \`deployment/install.yaml\` décrivant ce qui doit être installé (voir \`xcore-agent init-plan\` pour en générer un point de départ).

## Construire et publier

\`\`\`bash
xcore-agent publish ./mon-projet \\\\
  --project-id prj_07501cca11f3fda3b5304e0b1ea7ec17 \\\\
  --project-name "Mon Projet" \\\\
  --version 1.0.0 \\\\
  --xdevkey xdk_... \\\\
  --signing-key-file ./signing_key.raw
\`\`\`

\`publish\` fait tout en une commande : construit l'artefact (tar → zstd → AES-256-GCM → signature Ed25519), puis l'envoie au Hub. Le DEK (la clé de chiffrement du contenu) ne touche jamais le disque — il reste en mémoire le temps de l'appel.

\`--signing-key-file\` est optionnel mais **fortement recommandé dès la deuxième version** : sans lui, une clé Ed25519 jetable est générée à chaque \`build\`/\`publish\`, ce qui casse la confiance d'un \`watch\`er déjà lancé (il épingle la clé publique de confiance au démarrage et rejette toute version signée par une clé différente). Générez-en une une fois, gardez-la :

\`\`\`bash
python3 -c "
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization
k = Ed25519PrivateKey.generate()
open('signing_key.raw', 'wb').write(k.private_bytes(
    encoding=serialization.Encoding.Raw,
    format=serialization.PrivateFormat.Raw,
    encryption_algorithm=serialization.NoEncryption(),
))
open('signing_key.pub', 'wb').write(k.public_key().public_bytes(
    encoding=serialization.Encoding.Raw,
    format=serialization.PublicFormat.Raw,
))
"
\`\`\`

## Construire sans publier (\`build\`)

\`\`\`bash
xcore-agent build ./mon-projet \\\\
  --project-id prj_... --project-name "Mon Projet" --version 1.0.1 \\\\
  --output ./out/mon-projet-1.0.1.xdeploy \\\\
  --signing-key-file ./signing_key.raw
\`\`\`

Produit juste le fichier local, sans upload — utile pour inspecter l'artefact avant de le publier séparément.

## Suivre les versions publiées

**Déploiements → Projets & clés**, sur un projet \`xdeploy\` : liste des artefacts publiés (badge *Dernière* sur le plus récent), suppression d'une version obsolète.
`,
  },
  {
    id: 'xdeploy-deploy',
    label: 'Déployer avec xcore-agent',
    title: 'Déployer avec xcore-agent',
    content: `
Deux circuits de déploiement totalement séparés, selon ce que vous publiez et installez.

## Circuit \`.xdeploy\` — bundles multi-composants scellés

\`\`\`bash
xcore-agent deploy \\\\
  --project-id prj_... --version 1.0.0 \\\\
  --xdevkey xdk_... --deployment-credential UVD096B3azgjDZlAqyc4dEGtabY6ski2HBmL0X51hUU \\\\
  --project-root /etc/xcore/projects/mon-projet \\\\
  --signer-public-key ./signing_key.pub
\`\`\`

\`--deployment-credential\` est le **second secret** révélé à la création de la clé (distinct de \`--xdevkey\`) — nécessaire pour déchiffrer le DEK et donc le contenu de l'artefact. \`--signer-public-key\` doit correspondre à la clé Ed25519 utilisée à la publication, sinon la vérification de signature échoue et l'installation est refusée.

Pour surveiller en continu et redéployer automatiquement dès qu'une nouvelle version est publiée :

\`\`\`bash
xcore-agent watch \\\\
  --project-id prj_... --xdevkey xdk_... --deployment-credential ... \\\\
  --project-root /etc/xcore/projects/mon-projet \\\\
  --signer-public-key ./signing_key.pub \\\\
  --interval 60 --supervisor systemd
\`\`\`

\`--supervisor systemd\` redémarre chaque plugin via son unité \`xcore-plugin-<id>.service\` après un redéploiement réussi (aussi disponible : \`docker\`, \`kubernetes\`, ou \`none\`).

## Circuit marketplace direct — un seul plugin ou service à la fois

Pas de chiffrement, ZIP signé HMAC-SHA256 — celui utilisé par la publication décrite plus haut.

\`\`\`bash
xcore-agent deploy-marketplace mon-plugin \\\\
  --version latest \\\\
  --api-key xdk_... --signing-secret <secret-hmac-du-developpeur> \\\\
  --project-root /etc/xcore/projects/mon-app \\\\
  --install-plan ./install.yaml
\`\`\`

Ajoutez \`--kind service\` pour déployer un service au lieu d'un plugin. \`--signing-secret\` est le secret HMAC du **développeur qui a publié** ce plugin (voir Déploiements → Clé de signature côté publication) — obtenu hors-bande, jamais partagé automatiquement.

Pour automatiser (le pendant CI/CD de \`watch\`, côté opérateur cette fois plutôt que côté développeur) :

\`\`\`bash
xcore-agent watch-marketplace mon-plugin \\\\
  --kind plugin --api-key xdk_... --signing-secret ... \\\\
  --project-root /etc/xcore/projects/mon-app \\\\
  --install-plan ./install.yaml \\\\
  --interval 60 --once=false
\`\`\`

\`--once\` (au lieu de la boucle infinie par défaut) fait une seule vérification puis quitte — pratique pour un cron externe plutôt qu'un service qui tourne en continu.

## Nettoyage

\`\`\`bash
xcore-agent gc --project-root /etc/xcore/projects/mon-app --keep-snapshots 3
\`\`\`

Purge les anciens instantanés de rollback et les téléchargements en cache — appelé automatiquement après chaque redéploiement réussi par \`watch\`/\`watch-marketplace\`, mais peut aussi être lancé à la main.
`,
  },
  {
    id: 'install-local',
    label: 'Installer en local',
    title: 'Installer un plugin ou un service en local',
    content: `
Pour ajouter un plugin ou un service déjà publié sur le Hub à **votre propre projet xcore** (pas pour le publier vous-même), l'outil est \`xcli\` (le paquet \`xcorecli\`) — une CLI de gestion de projet distincte de \`xcore-agent\`, à lancer **depuis l'intérieur** d'un projet xcore (elle lit son \`integration.yaml\`).

## Installer

\`\`\`bash
pip install xcorecli
\`\`\`

### Configurer les identifiants (une fois)

Deux secrets distincts sont nécessaires — l'un ne remplace pas l'autre :

\`\`\`bash
xcli config set api-key xdk_...           # autorise le téléchargement
xcli config set signing-key <secret>       # vérifie la signature HMAC du ZIP téléchargé
\`\`\`

Les deux sont visibles une seule fois à la création — depuis **Déploiements → Projets & clés** (clé API, projet \`kind=plugin\` dont le slug correspond exactement au plugin visé) et **Déploiements → Clé de signature**.

### Parcourir le catalogue (sans identifiants — public)

\`\`\`bash
xcli plugin marketplace browse --sort downloads
xcli plugin marketplace search "auth"
xcli plugin marketplace info xlicense
\`\`\`

### Installer un plugin

\`\`\`bash
xcli plugin install xlicense              # dernière version
xcli plugin install xlicense@1.2.3        # version précise
xcli plugin versions xlicense             # lister les versions disponibles avant de choisir
\`\`\`

Le ZIP est téléchargé, sa signature HMAC vérifiée avant toute extraction — en cas d'échec de vérification, **rien n'est extrait**. Le plugin atterrit dans le dossier \`plugins/\` de votre projet (configurable via \`plugins.directory\` dans \`integration.yaml\`).

### Mettre à jour un plugin déjà installé

\`\`\`bash
xcli plugin update check                  # compare toutes les versions installées au Hub
xcli plugin update apply xlicense          # met à jour un plugin précis
xcli plugin update apply --all --dry-run   # aperçu sans rien télécharger
\`\`\`

### Vérifier l'intégrité

\`\`\`bash
xcli plugin health   # signature + AST + validité du manifeste, pour tous les plugins installés
xcli plugin info xlicense
\`\`\`

## Installer un service

\`xcli\` n'a pas encore de sous-commande dédiée pour les services (\`xcli plugin install\` est spécifique aux plugins). Deux options en attendant :

**Avec \`xcore-agent\`** (recommandé — gère aussi le redémarrage du service) :

\`\`\`bash
xcore-agent deploy-marketplace mon-service \\\\
  --kind service \\\\
  --api-key xdk_... --signing-secret ... \\\\
  --project-root /etc/xcore/projects/mon-app \\\\
  --install-plan ./install.yaml
\`\`\`

**Directement en HTTP** — le contrat est le même que pour un plugin, juste sous \`/app/xservices\` :

\`\`\`bash
curl -sS "https://marketplace.xcorehub.dev/app/xservices/services/mon-service/install?version=latest" \\\\
  -H "X-API-Key: xdk_..." \\\\
  -o mon-service.zip
# réponse : en-têtes X-Signature (hmac_sha256:<hex>) et X-Service (nom@version) à vérifier avant extraction
\`\`\`
`,
  },
]
