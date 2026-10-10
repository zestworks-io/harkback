<p align="center">
  <img src="assets/logo.png" alt="Harkback" width="96">
</p>

<h1 align="center">Harkback</h1>

<h3 align="center">
Faites expliquer les termes pendant que vous lisez. Gardez en mémoire ce que vous avez compris.<br>Retrouvez-le quand le terme reviendra.
</h3>

<p align="center">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue.svg"></a>
  <a href="CHANGELOG.md"><img alt="Version" src="https://img.shields.io/github/package-json/v/zestworks-io/harkback?filename=apps%2Fextension%2Fpackage.json&label=version&color=informational"></a>
  <img alt="Chrome MV3" src="https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white">
  <img alt="Node 22+" src="https://img.shields.io/badge/node-%E2%89%A522-339933?logo=nodedotjs&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white">
  <img alt="Local first" src="https://img.shields.io/badge/data-local--first-success">
  <a href="https://github.com/zestworks-io/harkback/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/zestworks-io/harkback?style=flat"></a>
  <a href="https://github.com/zestworks-io/harkback/commits/main"><img alt="Last commit" src="https://img.shields.io/github/last-commit/zestworks-io/harkback"></a>
  <a href="CONTRIBUTING.md"><img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"></a>
</p>

<p align="center">
| <a href="#démarrage-rapide"><b>Démarrage rapide</b></a> | <a href="#fonctionnalités"><b>Fonctionnalités</b></a> | <a href="guide/README.md"><b>Documentation</b></a> | <a href="#confidentialité"><b>Confidentialité</b></a> | <a href="CHANGELOG.md"><b>Journal des modifications</b></a> | <a href="CONTRIBUTING.md"><b>Contribuer</b></a> |
</p>

<p align="center"><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a> · <b>Français</b> · <a href="README.de.md">Deutsch</a> · <a href="README.pt-BR.md">Português (Brasil)</a></p>

Harkback est une extension Chrome pour les personnes qui lisent des articles scientifiques et des documents techniques. Sélectionnez un terme et elle l'explique en contexte. Chaque explication est conservée dans un journal local en ajout seul. Quand le même terme apparaît sur une page ultérieure, même sous une autre graphie, Harkback le souligne et affiche ce que vous aviez compris la dernière fois.

> « harken back » : revenir à un point antérieur.

<p align="center">
  <a href="assets/demo.mp4"><img src="assets/demo.gif" alt="Demo" width="720"></a>
  <br><sub>Sélectionnez un terme dans un PDF, posez une question de suivi, et toute la conversation est conservée. Cliquez sur l'animation pour la vidéo en pleine qualité.</sub>
</p>

## Démarrage rapide

```sh
git clone https://github.com/zestworks-io/harkback.git && cd harkback
pnpm install && pnpm --filter @harkback/extension build
```

Ouvrez `chrome://extensions`, activez le **mode développeur**, choisissez **Charger l'extension non empaquetée** et sélectionnez `apps/extension/.output/chrome-mv3`. Choisissez ensuite un modèle :

<details open>
<summary><b>Modèle local (gratuit)</b></summary>

Installez [Ollama](https://ollama.com), téléchargez un modèle et, sur la page d'accueil de configuration, choisissez **Ollama**. Utilisez _Tester la connexion_ pour obtenir la commande qui autorise l'extension. Rien ne quitte votre ordinateur.

</details>

<details>
<summary><b>Modèle hébergé (avec votre propre clé d'API)</b></summary>

Choisissez OpenAI, Anthropic, Google Gemini, xAI Grok, OpenRouter ou une adresse personnalisée compatible OpenAI, puis collez votre clé. Le fournisseur vous facture directement ; Harkback n'a aucun serveur intermédiaire.

</details>

Sélectionnez ensuite un terme sur n'importe quelle page et appuyez sur `Alt+Shift+E`. Voir [Installation](#installation) et [Connecter un modèle](#connecter-un-modèle) pour les détails. Les premiers pas sont décrits dans le [guide de prise en main](guide/fr/getting-started.md).

<details>
<summary><b>Sommaire</b></summary>

- [Pourquoi ne pas simplement demander à ChatGPT ?](#pourquoi-ne-pas-simplement-demander-à-chatgpt-)
- [Fonctionnalités](#fonctionnalités)
- [Votre graphe de connaissances](#votre-graphe-de-connaissances)
- [Fonctionnement](#fonctionnement)
- [Installation](#installation)
- [Connecter un modèle](#connecter-un-modèle)
- [Utiliser Harkback](#utiliser-harkback)
- [Documentation](#documentation)
- [Confidentialité](#confidentialité)
- [Vos données](#vos-données)
- [Limites](#limites)
- [Structure du dépôt](#structure-du-dépôt)
- [Développement](#développement)
- [Contribuer](#contribuer)
- [Licence](#licence)

</details>

## Pourquoi ne pas simplement demander à ChatGPT ?

Vous pouvez coller un terme dans un chatbot et obtenir une bonne réponse. Harkback n'essaie pas de donner une meilleure réponse. Il ajoute ce qui manque à une fenêtre de discussion : la **mémoire**. Chaque terme consulté devient un enregistrement lié à la page, à la citation et à la date, et ces enregistrements sont reliés dans un graphe de connaissances qui vous appartient.

|                         | Demander à un chatbot                                                   | Harkback                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Contexte**            | Copier le terme et un bout de texte, changer d'onglet                   | Sélectionner le terme sur la page ; son paragraphe et sa section l'accompagnent, et la citation est vérifiée   |
| **La prochaine fois**   | Une nouvelle conversation repart de zéro, ou vous oubliez avoir demandé | Le terme est souligné sur les pages suivantes, avec ce que vous aviez compris                                  |
| **Structure**           | Un tas de transcriptions                                                | Des concepts avec alias, prérequis, variantes et termes apparentés                                             |
| **Rétention**           | Aucune                                                                  | Une file de révision planifiée par un modèle de mémoire : chaque terme revient juste avant que vous l'oubliiez |
| **Vos enregistrements** | Vivent dans le compte du fournisseur                                    | Restent dans votre navigateur ; export en Markdown, notes Obsidian ou JSONL                                    |
| **Modèle et coût**      | Un service, une formule                                                 | N'importe quel modèle pris en charge : Ollama en local ne coûte rien, ou utilisez votre propre clé d'API       |

Harkback est gratuit et open source (Apache-2.0), sans serveur ni abonnement. Il a en revanche besoin d'un modèle pour rédiger les explications : un modèle local est gratuit, et un modèle hébergé est facturé par son fournisseur sur votre propre clé.

## Fonctionnalités

- **Expliquer en contexte.** Sélectionnez un terme, cliquez sur _Expliquer_ ou appuyez sur `Alt+Shift+E`. La réponse arrive en flux depuis le modèle que vous avez configuré et porte la mention _défini dans la source_ (la page définit le terme et la citation est vérifiée dans le texte de la page) ou _connaissance externe_.
- **Mémoriser.** Chaque explication, question de suivi et marque « compris / toujours confus » est stockée comme un événement dans IndexedDB. Rien ne quitte votre navigateur, hormis la requête au modèle que vous déclenchez.
- **Conversations de suivi.** Posez d'autres questions sur la carte ; chaque question reste au-dessus de sa réponse, et la conversation est enregistrée avec l'explication. L'Historique l'affiche en entier et la recherche la retrouve. Les formules sont composées.
- **Retrouvailles.** Sur les pages suivantes, les termes déjà consultés sont soulignés. Survolez-les pour voir quand et où vous avez rencontré le terme et ce que vous aviez compris, avec une ligne indiquant quel texte de la page a correspondu ; vous pouvez alors le marquer comme retenu, l'expliquer à nouveau, comparer les deux usages ou le mettre en sourdine.
- **Un concept, plusieurs graphies.** `LLM`, `LLMs`, `the LLM`, `large language model` et `Large-Language Models` forment un seul concept. De même `β-VAE` et `beta-VAE`, ou `fine-tuning` et `ﬁne-tuning` avec ligature. Les correspondances approchées vous sont soumises sous la forme « est-ce le terme que vous avez consulté il y a 3 jours ? ».
- **Termes apparentés.** Si un modèle indique que `QLoRA` est une variante de `LoRA`, une page qui ne mentionne que `QLoRA` vous rappelle ce que vous aviez compris de `LoRA`.
- **Pages de concept.** Ouvrez n'importe quel terme dans l'Historique pour voir à quel point vous l'avez compris, sur quoi il repose (prérequis), ses variantes et ses termes apparentés, et chacune de vos rencontres. Vous pouvez ajouter un alias, fusionner deux concepts identiques, supprimer une relation erronée ou mettre un terme en sourdine.
- **Révision.** L'Historique affiche un bouton _Réviser_ avec le nombre de termes à revoir. Chaque terme est planifié avec [FSRS-7](https://github.com/open-spaced-repetition/fsrs4anki), un modèle de mémoire : notez une réponse _À revoir_, _Difficile_, _Bien_ ou _Facile_ et le terme revient juste avant que vous l'oubliiez ; les termes faciles s'espacent vite et les difficiles reviennent bientôt. Chaque bouton indique quand le terme reviendra. Vous pouvez saisir ce dont vous vous souvenez avant de révéler l'explication, et un bouton facultatif, **Vérifier ma réponse**, demande à votre modèle à quel point vous étiez proche (il ne suggère qu'une note ; c'est vous qui choisissez, et vous pouvez le désactiver dans les paramètres). Toute la révision se fait au clavier : `Space` affiche l'explication, `1`–`4` note, `S` passe. Les termes qui reposent sur d'autres viennent après leurs prérequis lorsque les deux sont à revoir, et un terme qui vous résiste renvoie aux prérequis qui manquent peut-être. Retenir un terme depuis un rappel de retrouvailles compte comme une révision légère. Un paramètre fixe la probabilité de vous souvenir d'un terme à son échéance (90 % par défaut). L'icône de la barre d'outils affiche le nombre de termes à revoir.
- **Bilan hebdomadaire.** Historique → _Bilan_ montre ce que vous avez rencontré en une semaine : termes nouveaux et revus, réponses, termes qui vous échappent encore, lieux de lecture et nouveaux liens entre concepts. Il est construit sur votre ordinateur à partir de vos enregistrements et n'appelle aucun modèle.
- **S'appuie sur ce que vous savez.** Quand un terme consulté ressemble à un terme que vous comprenez déjà, le modèle en est informé et peut expliquer la différence au lieu de repartir de zéro.
- **Confidentiel par conception.** L'analyse automatique est limitée à arxiv.org tant que vous n'ajoutez pas de sites ; un bouton dans les paramètres ajoute les sites de recherche courants. Les sites sensibles peuvent être forcés sur un modèle local, et les fenêtres privées n'enregistrent ni n'analysent jamais.
- **Enregistrements portables.** Exportez tout en Markdown, en cartes Anki, en dossier de notes liées (un fichier par concept avec des `[[liens]]`, prêt pour Obsidian ; ce que vous écrivez sous la ligne repère survit à l'export suivant) ou en journal d'événements JSONL versionné avec un schéma JSON publié. Une sauvegarde JSONL hebdomadaire est écrite dans `Downloads/harkback`, et **Importer un JSONL** dans l'Historique la restaure (les enregistrements déjà présents sont ignorés). Un paramètre permet d'exclure les sources sensibles des sauvegardes et des exports.
- **Arrêter, réessayer, changer de modèle.** Un bouton _Arrêter_ interrompt une réponse pendant sa rédaction. Après un échec, la carte propose _Réessayer_ et, si plusieurs modèles sont configurés, _Essayer avec…_ pour chacun des autres.
- **Aperçu d'une page avant de la lire.** Cliquez sur le bouton de la barre d'outils, appuyez sur `Alt+Shift+P` ou utilisez le menu contextuel : Harkback propose d'analyser la page en nommant le modèle et en précisant s'il est distant ; rien n'est envoyé avant votre accord. Un appel au modèle repère les termes clés de la page, et vos propres enregistrements les classent en _toujours confus_, _rouillés_, _nouveaux pour vous_ et _connus_. _Aperçu_ montre votre explication précédente pour un terme connu, ou une courte explication rédigée par le modèle pour un terme nouveau, et n'enregistre rien. Le modèle ne voit que le texte de la page, jamais votre liste de concepts, et une page sensible n'utilise qu'un modèle local. Une analyse lit les 16 000 premiers caractères d'une page et vous prévient quand une page plus longue a été tronquée.
- **Sous-titres YouTube.** Ajoutez YouTube dans les paramètres et, sous-titres activés, les termes déjà consultés sont soulignés dans la ligne de sous-titres. Mettez en pause et sélectionnez un terme pour l'expliquer à partir des sous-titres que vous avez vus. La consultation est enregistrée avec sa position de lecture (`12:34`), et l'Historique, la Révision et les exports renvoient à ce moment. Désactivé tant que vous n'ajoutez pas le site ; rien n'est téléchargé, seule la ligne de sous-titres affichée à l'écran est lue.
- **GitHub, Notion et Google Docs.** Ajoutez le site dans les paramètres et ses pages sont lues selon leur propre mise en page : le README d'un dépôt, la conversation d'une issue ou d'une pull request, une page Notion, la vue publiée ou mobile d'un document Google. Un document est une seule source quelle que soit la façon dont vous y êtes arrivé, et seul son texte est lu, pas les menus qui l'entourent.
- **Demande avant d'envoyer une page privée.** Une page qui semble privée, comme un dépôt GitHub privé ou une page Notion ou Google Docs non publiée, n'est envoyée à aucun modèle tant que vous n'avez pas choisi _Local uniquement_ ou _Envoyer quand même_. Un cadenas dans le coin de la page affiche et modifie cet état ; votre choix est enregistré et peut être mémorisé pour le site.
- **Plusieurs façons de commencer.** Sélectionnez du texte et cliquez sur _Expliquer_ (sélection à la souris, au clavier ou au toucher), appuyez sur `Alt+Shift+E` ou utilisez _Expliquer_ dans le menu contextuel. Les pages qui chargent plus de texte ou passent à une autre page sans rechargement sont réanalysées.
- **Le modèle de votre choix.** Gemini Nano intégré à Chrome (sur votre ordinateur, rien à configurer), Ollama, OpenAI, Anthropic, Google Gemini, xAI Grok, OpenRouter ou tout serveur compatible OpenAI. Anthropic et Gemini utilisent leurs API natives.

## Votre graphe de connaissances

Chaque consultation enrichit un graphe de ce que vous avez lu, construit à partir de votre propre lecture et non de la mémoire d'un modèle généraliste.

- **Les concepts sont les nœuds.** `LoRA` est un seul nœud, quelle que soit la graphie d'une page (`LoRA`, `low-rank adaptation`) et la langue dans laquelle vous l'avez rencontré. Il conserve ses alias, son domaine et votre niveau de compréhension.
- **Les relations sont les arêtes.** Un modèle propose des liens `variant_of`, `prerequisite` et `related` lorsque vous consultez un terme, par exemple `QLoRA` est une variante de `LoRA`. Vous pouvez en supprimer un erroné, fusionner deux concepts identiques ou ajouter un alias.
- **Tout renvoie à une preuve.** Un concept liste chaque rencontre : la page, la citation, la date, votre explication et la conversation de suivi.
- **Le graphe travaille.** Une page qui ne mentionne que `QLoRA` vous rappelle `LoRA`, le modèle est informé de ce que vous savez déjà pour expliquer la différence, et la révision est planifiée par concept.
- **Il vous appartient.** Exportez un dossier de notes liées (`[[liens]]`, un fichier par concept) et ouvrez-le dans Obsidian pour y voir le graphe, ou exportez le journal d'événements complet en JSONL.

Ouvrez **Graphe** dans l'Historique pour le voir comme une carte : les concepts sont colorés selon votre compréhension (compris, fragile, confus ou nouveau), avec des flèches pour les prérequis et les variantes. Filtrez par domaine, par compréhension ou par date de dernière consultation. Glissez pour déplacer, faites défiler pour zoomer, cliquez sur un concept pour l'ouvrir. Vous pouvez aussi le parcourir via les pages de concept, et via Obsidian après export.

## Fonctionnement

```
 lire                expliquer               mémoriser                retrouver
 ────                ─────────               ─────────                ─────────
 content script  →   background worker   →   journal d'événements →  le comparateur analyse la
 extrait le texte    choisit un modèle       en ajout seul            page suivante à la recherche
 de la page, suit    selon la sensibilité    (IndexedDB), rejoué en   des noms connus, choisit les
 votre sélection     du site, diffuse la     concepts, alias et       concepts à montrer et dessine
                     réponse, résout le      rencontres               le soulignement + la carte
                     concept
```

1. **Lire.** Un content script extrait le texte lisible de la page (structure LaTeXML sur arXiv, Readability ailleurs) et conserve une table de correspondance entre les positions dans le texte et les nœuds du DOM.
2. **Expliquer.** Le background worker vérifie les règles du site, choisit un modèle, applique une limite de débit locale et envoie le terme avec son paragraphe. Le prompt énumère les concepts connus comme candidats pour que le modèle puisse dire « c'est le même concept que c1 ». La réponse est analysée avec indulgence : cartes tronquées, virgules finales et étiquettes décorées sont tolérées.
3. **Mémoriser.** Le résultat devient des événements (`concept.created`, `encounter.created`, `edge.proposed`, ...). Les concepts, alias et fusions sont dérivés en rejouant le journal et ne sont jamais stockés, si bien qu'une meilleure règle de correspondance améliore aussi les anciens enregistrements.
4. **Retrouver.** Sur chaque page, un comparateur Aho-Corasick parcourt le texte à la recherche de tous les noms et abréviations connus. La sélection des retrouvailles applique ensuite les règles qui la gardent utile : pas sur la page où vous avez consulté le terme, pas en deçà d'un intervalle minimal, les concepts en sourdine le restent, et une abréviation ambiguë exige la présence d'un second terme du même domaine sur la page.

## Installation

Nécessite Node 22 ou plus récent et [pnpm](https://pnpm.io). Il n'y a pas encore de fiche sur un store ; chargez donc l'extension depuis les sources :

```sh
# depuis la racine du dépôt
pnpm install
pnpm --filter @harkback/extension build
```

Ouvrez `chrome://extensions`, activez le **mode développeur**, choisissez **Charger l'extension non empaquetée** et sélectionnez `apps/extension/.output/chrome-mv3`. La page d'accueil de configuration s'ouvre à l'installation.

**Microsoft Edge.** Exécutez `pnpm build -b edge` dans `apps/extension` (ou `pnpm zip:edge`), ouvrez `edge://extensions`, activez le **mode développeur**, choisissez **Charger l'extension décompressée** et sélectionnez `apps/extension/.output/edge-mv3`. Edge peut ne pas proposer le modèle intégré de Chrome ; choisissez un autre modèle lors de la configuration.

## Connecter un modèle

La configuration initiale comporte trois étapes : **Bienvenue** (un exemple de rappel de retrouvailles et une explication d'exemple intégrée que vous pouvez essayer sans appeler de modèle), **Confidentialité** (où va votre texte ; vous devez cocher la case de consentement pour activer _Suivant_) et **Modèle** (choisissez un fournisseur, puis _Terminer_). Relancer la configuration met à jour le modèle déjà présent au lieu d'en ajouter une copie. Vous pouvez ajouter d'autres modèles et modifier les options plus tard dans la page des paramètres, qui règle aussi les limites de débit, les rappels de retrouvailles et le temps pendant lequel un modèle peut rester silencieux avant que la requête soit abandonnée.

![La page des paramètres avec un modèle : nom, modèle, adresse, clé d'API et un bouton Tester la connexion](assets/settings.png)

| Fournisseur                  | Base URL                                           | Remarques                                                                                                                                                                          |
| ---------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ollama                       | `http://127.0.0.1:11434/v1`                        | Local, sans clé. Voir ci-dessous.                                                                                                                                                  |
| Chrome intégré (Gemini Nano) | aucune                                             | Sur cet ordinateur, sans clé. À télécharger dans la configuration ou les paramètres. Un petit modèle : plus lent qu'un modèle cloud, et meilleur en anglais, espagnol et japonais. |
| OpenAI                       | `https://api.openai.com/v1`                        | Nécessite une clé d'API.                                                                                                                                                           |
| Anthropic                    | `https://api.anthropic.com/v1`                     | Nécessite une clé d'API.                                                                                                                                                           |
| Google Gemini                | `https://generativelanguage.googleapis.com/v1beta` | Nécessite une clé d'API.                                                                                                                                                           |
| xAI Grok                     | `https://api.x.ai/v1`                              | Nécessite une clé d'API.                                                                                                                                                           |
| OpenRouter                   | `https://openrouter.ai/api/v1`                     | Nécessite une clé d'API.                                                                                                                                                           |
| Personnalisé                 | n'importe quelle adresse                           | `https`, sauf cet ordinateur et votre propre réseau (`192.168.x.x`, `10.x.x.x`, `name.local`, Tailscale).                                                                          |

Chaque fournisseur parle son propre format : Anthropic et Google Gemini utilisent leurs API natives, et tout le reste, y compris Ollama, Grok, OpenRouter et toute adresse personnalisée comme un proxy d'entreprise, utilise le format compatible OpenAI. Choisir un fournisseur renseigne son adresse, que vous pouvez toujours modifier. Choisissez **Personnalisé** pour tout autre service compatible OpenAI.

Chrome vous demande d'autoriser l'accès à l'adresse du modèle la première fois que vous le testez ou l'enregistrez. Si vous refusez, la carte d'explication l'indique au lieu d'échouer avec une erreur réseau.

**Ollama** rejette les requêtes des extensions de navigateur tant que l'origine de l'extension n'est pas autorisée. Le bouton _Tester la connexion_ affiche la commande exacte pour votre système, par exemple sur macOS :

```sh
launchctl setenv OLLAMA_ORIGINS "chrome-extension://<your-extension-id>"
```

puis redémarrez Ollama.

## Utiliser Harkback

| Vous voulez                                      | Faites ceci                                                                                                                                                                                           |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expliquer un terme                               | Sélectionnez-le et cliquez sur **Expliquer**, ou appuyez sur `Alt+Shift+E`.                                                                                                                           |
| Poser d'autres questions                         | Utilisez **Poser une question** sur la carte. La question et la réponse sont enregistrées avec l'explication.                                                                                         |
| Analyser une page qui n'est pas sur arXiv        | Cliquez sur le bouton de la barre d'outils, ou autorisez le site dans _Sites_ dans les paramètres pour des analyses automatiques.                                                                     |
| Lire un PDF                                      | Cliquez sur le bouton de la barre d'outils sur le PDF : les articles arXiv s'ouvrent en HTML, les autres PDF dans le lecteur.                                                                         |
| Voir ce que vous avez consulté                   | Ouvrez la page d'historique depuis la page des paramètres ou la page d'accueil de configuration. Elle se met à jour en direct, et le titre de la source de chaque entrée renvoie à la page d'origine. |
| Conserver vos enregistrements                    | Page d'historique → **Exporter en Markdown**, **Exporter des cartes Anki** ou **Sauvegarder le JSONL maintenant**.                                                                                    |
| Restaurer depuis une sauvegarde                  | Page d'historique → **Importer un JSONL**.                                                                                                                                                            |
| Voir comment les concepts sont reliés            | Page d'historique → **Graphe**.                                                                                                                                                                       |
| Cesser de souligner un terme                     | Survolez le soulignement → **Ne plus afficher**.                                                                                                                                                      |
| Garder une source à l'écart des modèles distants | Carte → **Marquer la source comme sensible**, ou ajoutez une règle de sensibilité pour le site dans les paramètres.                                                                                   |
| Trancher pour une page qui semble privée         | Le cadenas dans le coin de la page, ou la question lors de votre première explication : **Local uniquement** ou **Envoyer quand même**.                                                               |

## Documentation

Le dossier [`guide/`](guide/README.md) contient les détails (en anglais, sauf le [guide de prise en main](guide/fr/getting-started.md)) :

- [Prise en main](guide/fr/getting-started.md), le [guide de l'utilisateur](guide/user-guide.md), [modèles et fournisseurs](guide/models.md) et [dépannage](guide/troubleshooting.md).
- [Confidentialité et sources sensibles](guide/privacy.md) : ce qui est envoyé, ce qui ne l'est jamais, et comment c'est garanti.
- [Architecture](guide/architecture.md) et [format des données](guide/data-format.md), pour les contributeurs et pour qui veut construire sur vos enregistrements.
- Le [journal des modifications](CHANGELOG.md).

## Confidentialité

- Lorsque vous demandez une explication, le texte sélectionné, son paragraphe, la section et le titre de la page sont envoyés au service de modèle que vous avez configuré, selon les conditions de ce fournisseur.
- En révision, le bouton facultatif **Vérifier ma réponse** envoie le terme, votre réponse saisie et son explication enregistrée à votre modèle, uniquement lorsque vous l'appuyez. Désactivez-le dans les paramètres et le bouton n'apparaît plus. Il suit les mêmes règles de modèle et de sources sensibles qu'une explication.
- Les enregistrements restent dans ce navigateur. Les sauvegardes ne contiennent que des enregistrements, jamais de paramètres ni de clés d'API.
- Les pages ne sont analysées automatiquement que sur arxiv.org. Partout ailleurs, vous devez cliquer sur le bouton, appuyer sur `Alt+Shift+E` ou autoriser le site.
- Le contenu d'une source sensible n'est jamais envoyé à un modèle non local, y compris comme contexte de comparaisons ultérieures. Un serveur de votre propre réseau compte comme non local. Une source reste sensible jusqu'à ce que vous la marquiez comme normale sur son entrée de l'Historique.
- Une page qui semble privée (un dépôt GitHub privé ; une page Notion ou Google Docs non publiée) n'est envoyée à aucun modèle avant votre choix. Les pages que le site ne marque ni dans un sens ni dans l'autre font l'objet d'une question sur Notion et Google Docs, mais pas sur GitHub. Ce qu'une page laisse entendre sur elle-même n'est qu'un indice : marquez un site comme sensible quand cela compte.
- Un paramètre exclut les sources sensibles des sauvegardes et des exports.
- Les fenêtres privées expliquent, mais n'enregistrent, n'analysent ni n'affichent jamais de retrouvailles.
- Les soulignements de retrouvailles vivent dans la page ; les scripts propres à la page peuvent donc déduire pour quels termes vous avez des enregistrements.
- Supprimer une explication la retire de l'application ; des traces peuvent subsister sur le disque, et les sauvegardes exportées ne peuvent pas être rappelées.
- Les clés d'API sont stockées **non chiffrées** dans le stockage de l'extension.

Les notes affichées dans l'extension font foi : [`apps/extension/src/lib/pages/privacy.ts`](apps/extension/src/lib/pages/privacy.ts).

## Vos données

Tout est un événement dans un journal en ajout seul. Le format est public :

- Types d'événements et charges utiles : [`packages/spec`](packages/spec), avec le [schéma JSON](packages/spec/schema/event.schema.json) généré.
- Rejeu, correspondance et export : [`packages/core`](packages/core), qui n'a aucune dépendance au navigateur et peut s'utiliser seul.

Comme les concepts et les alias sont dérivés du journal, votre sauvegarde JSONL est une copie complète et portable de ce que vous savez.

## Limites

- Chrome et Microsoft Edge (Manifest V3). Firefox et Safari ne sont pas pris en charge. Le modèle intégré de Chrome n'est pas disponible dans tous les navigateurs ; Edge nécessite un autre modèle.
- Les explications dépendent du modèle choisi ; de petits modèles locaux peuvent produire des cartes de concept plus faibles, ce qui réduit la qualité des retrouvailles mais n'empêche jamais l'enregistrement.
- Le texte du lecteur PDF intégré au navigateur ne peut pas être lu ; Harkback ouvre donc le PDF dans sa propre page de lecture (les articles arXiv vont plutôt vers la version HTML). Les PDF numérisés sont lus par OCR sur votre ordinateur (l'anglais est intégré ; les autres langues sont un téléchargement chacune depuis `cdn.jsdelivr.net`), ce qui est plus lent et moins précis qu'un vrai texte, ne restitue ni l'écriture manuscrite, ni les formules, ni les tableaux, et la détection des paragraphes dans les mises en page compliquées (tableaux, figures avec texte, trois colonnes ou plus) est approximative. Un PDF sur votre ordinateur demande deux autorisations : activez « Autoriser l'accès aux URL de fichier » pour Harkback dans `chrome://extensions`, puis cliquez sur « Autoriser les fichiers locaux » sur la page de lecture la première fois.
- La correspondance automatique des abréviations exige au moins trois mots dans le nom complet (`LLM` pour `Large Language Model`). Deux abréviations qui correspondent à des noms complets différents dans le même domaine (par exemple deux « GNN » différents) restent des concepts distincts.
- Les noms chinois, et les noms japonais écrits uniquement en kanji, doivent compter au moins trois caractères pour être soulignés, afin d'éviter les faux positifs. Les noms contenant des kana ou du hangul en demandent deux.
- YouTube : seules les pages `www.youtube.com/watch` avec sous-titres (CC) activés sont lues, et seules les lignes de sous-titres que le lecteur a affichées depuis l'ouverture de la page sont disponibles comme contexte. Les sous-titres générés automatiquement écorchent souvent les termes techniques, et un terme mal orthographié ne correspond pas à vos enregistrements. Les Shorts, les lecteurs intégrés à d'autres sites et le mode plein écran (le lecteur masque les rappels de Harkback ; utilisez le mode cinéma) ne sont pas pris en charge, et un changement de la page YouTube peut empêcher la lecture des sous-titres jusqu'à une mise à jour de Harkback.
- GitHub, Notion et Google Docs : seules sont lues les pages d'accueil de dépôt, les issues et pull requests (pas les fichiers de code), les pages Notion et les documents Google en vue publiée ou mobile. Notion n'affiche que les blocs qu'il a dessinés, donc une longue page peut n'être lue qu'en partie. L'éditeur de Google Docs dessine son texte et ne peut pas être lu, et la vue d'aperçu n'a pas été vérifiée. Ces sites changent de mise en page sans préavis ; quand Harkback n'en reconnaît plus un, il lit la page comme n'importe quelle autre jusqu'à sa mise à jour.
- Les accents sont ignorés lors de la correspondance (« résumé » et « resume » forment un seul terme), mais il n'y a pas de racinisation pour les langues autres que l'anglais ; les formes fléchies, comme les pluriels allemands, sont donc des termes distincts.
- L'interface est en anglais par défaut et existe aussi en chinois simplifié et traditionnel, japonais, coréen, espagnol, français, allemand et portugais du Brésil. Les explications peuvent être rédigées dans 16 langues, choisies séparément dans les paramètres. Les notes et le Markdown exportés n'utilisent que des libellés en anglais ou en chinois.

## Structure du dépôt

| Chemin           | Contenu                                                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/spec`  | Le format d'événements : constantes, schémas zod et schéma JSON généré.                                                                                         |
| `packages/core`  | Logique pure : rejeu, normalisation des noms, correspondance des concepts, sélection des retrouvailles, prompts, analyse des sorties, export JSONL et Markdown. |
| `apps/extension` | L'extension Chrome, construite avec [WXT](https://wxt.dev) : content script, background worker, historique, paramètres et configuration initiale.               |
| `tools/lint`     | Configuration d'ESLint.                                                                                                                                         |
| `guide`          | La documentation : guide de l'utilisateur, modèles, confidentialité, architecture, format des données.                                                          |

## Développement

```sh
pnpm install
pnpm --filter @harkback/extension dev     # rechargement à chaud
```

Avant d'ouvrir une pull request :

```sh
pnpm typecheck     # tous les paquets
pnpm lint          # ESLint
pnpm test          # tests unitaires
pnpm check:build   # build de production : permissions du manifest et taille du content script
pnpm e2e           # tests de bout en bout dans Chromium (lancez une fois `pnpm exec playwright install chromium`)
pnpm format:check  # formatage
```

Pour empaqueter une version pour Microsoft Edge Add-ons, lancez `pnpm zip:edge` (voir `store/edge/README.md`). Pour empaqueter une version pour le Chrome Web Store, incrémentez `version` dans `apps/extension/package.json`, puis lancez `pnpm release`. Cette commande exécute les vérifications, construit l'extension de production, vérifie le paquet et écrit `apps/extension/.output/harkback-<version>-chrome.zip`. Utilisez `tools/package.sh --skip-checks` pour ne construire que le zip.

Les tests de bout en bout chargent l'extension construite dans Chromium, servent des pages arXiv depuis `apps/extension/fixtures` et dialoguent avec un serveur de modèle factice local. Ils couvrent toute la boucle : lire un article, expliquer, enregistrer, la page d'historique et les retrouvailles sur d'autres articles. Voir `apps/extension/e2e`.

## Contribuer

Les rapports de bogues et les pull requests sont les bienvenus. Lisez d'abord [CONTRIBUTING.md](CONTRIBUTING.md). Pour signaler un problème de sécurité, voir [SECURITY.md](SECURITY.md).

## Licence

[Apache-2.0](LICENSE)
