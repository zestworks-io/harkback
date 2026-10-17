# Fiche du Chrome Web Store : français

**Nom :** Harkback

**Résumé** (132 caractères maximum) :
Explique les termes pendant que vous lisez, retient ce que vous avez compris et vous le rappelle quand vous recroisez le terme.

**Catégorie :** Productivité

**Langue :** Français

## Description

Harkback s'adresse à celles et ceux qui lisent des articles scientifiques et des documents techniques. Sélectionnez un terme : il l'explique dans le contexte du paragraphe que vous lisez. Chaque explication est enregistrée dans votre navigateur. Quand le même terme réapparaît sur une page ultérieure, même orthographié autrement, Harkback le souligne et affiche ce que vous aviez compris la dernière fois.

Il ne cherche pas à être un meilleur chatbot. Il ajoute ce qui manque à une fenêtre de discussion : la mémoire.

FONCTIONNEMENT
• Sélectionnez un terme, puis cliquez sur Expliquer, utilisez le menu contextuel ou appuyez sur Alt+Shift+E. L'explication s'appuie sur le paragraphe et la section qui entourent le terme, et cite la page lorsque celle-ci le définit.
• Révisez les termes dont vous n'êtes pas sûr. Harkback les planifie avec le modèle de mémoire FSRS-7 : évaluez-vous avec À revoir, Difficile, Bien ou Facile, et chaque terme revient juste avant que vous ne l'oubliiez. Les termes qui reposent sur d'autres sont révisés dans le bon ordre, et un terme confus indique les prérequis qui vous manquent peut-être. Un clic droit sur l'icône de la barre d'outils ouvre Révision ou Historique.
• Prévisualisez une page avant de la lire : voyez lesquels de ses termes clés sont nouveaux pour vous et lesquels vous connaissez déjà.
• Sur les pages suivantes, les termes que vous avez consultés sont soulignés. Survolez-les pour voir l'explication précédente, où vous l'avez rencontré et à quel point vous l'aviez compris. Les abréviations correspondent à leur nom complet (« LLM » et « Large Language Model »).
• Posez des questions de suivi sur n'importe quelle carte. La conversation est enregistrée avec l'explication. Arrêtez une réponse en cours de route, ou réessayez avec un autre modèle si l'un échoue.
• Vos notes forment un graphe de connaissances : concepts, alias, prérequis, variantes et termes liés. Confirmez une relation dont le modèle n'était pas sûr, et scindez un concept qui a réuni deux termes différents (ce qui annule aussi une fusion). Recherchez-y, révisez-le, affichez-le comme une carte, exportez-le en notes Markdown (avec des [[liens]] pour Obsidian), en cartes Anki ou en sauvegarde JSONL que vous pouvez réimporter.
• Contribuez aux communs de données : Harkback crée un fichier anonyme à partir de vos recherches dans des articles arXiv et DOI sous licence ouverte (identifiant de l'article, terme, domaine, niveau de compréhension, mois), vous le montre en entier et l'enregistre sur votre ordinateur.

PDF ET ARTICLES
Les articles arXiv fonctionnent automatiquement. Les autres PDF s'ouvrent dans le lecteur propre à Harkback, avec les formules composées. Les PDF numérisés sont lus par OCR sur votre ordinateur au fil du défilement, puis se comportent comme du texte. L'anglais est intégré ; les autres langues se téléchargent une fois depuis une liste. Les autres sites ne sont analysés que lorsque vous cliquez sur le bouton de la barre d'outils ou autorisez le site. Dans Paramètres → Sites, vous pouvez aussi ajouter GitHub (README, issues et pull requests), Notion, Google Docs (vue publiée ou mobile) et les sous-titres YouTube, ou ajouter en un clic des sites de recherche courants comme bioRxiv, PubMed et OpenReview. Dans les sous-titres automatiques de YouTube, les termes sont reconnus même quand la reconnaissance vocale les écrit en minuscules, les épelle lettre par lettre ou les entend un peu de travers.

VOUS CHOISISSEZ LE MODÈLE
Harkback n'a ni serveur ni compte. Vous connectez votre propre modèle : soit un modèle qui tourne sur votre ordinateur, de sorte que votre texte ne le quitte jamais, soit un service hébergé que vous utilisez avec votre propre clé d'API. Les modèles de votre propre réseau fonctionnent aussi. Le modèle intégré de Chrome (Gemini Nano) tourne sur votre ordinateur sans rien à configurer. C'est un petit modèle, donc plus lent qu'un modèle dans le cloud et plus adapté aux explications courtes.

CONFIDENTIALITÉ
• Vos données restent dans votre navigateur. Le développeur ne reçoit rien.
• Seul ce que vous déclenchez est envoyé au modèle que vous avez configuré : pour une explication, le texte sélectionné, son paragraphe, la section et le titre de la page ; pour un aperçu de page, le texte de la page ; pour « Vérifier ma réponse », le terme et votre réponse.
• Marquez une source comme sensible et son contenu n'est envoyé qu'à un modèle local, jamais à un modèle distant. Une page qui semble privée (un dépôt GitHub privé, une page Notion ou Google Docs non publiée) n'est envoyée à aucun modèle tant que vous n'avez pas choisi Local uniquement ou Envoyer quand même.
• Les fenêtres privées expliquent mais n'enregistrent rien.
• Sur YouTube, Harkback ne lit que les sous-titres affichés par le lecteur, et seulement après que vous avez ajouté le site.
• Le fichier pour les communs de données ne contient ni citations, ni explications, ni adresses, ni heures exactes, et n'inclut jamais de source sensible. Rien n'est envoyé en ligne : c'est vous qui décidez de le soumettre ou non.
• Harkback ne télécharge lui-même que des données de langue OCR facultatives, une seule fois, vérifiées par somme de contrôle. Si vous choisissez le modèle intégré de Chrome, c'est Chrome qui le télécharge quand vous cliquez sur Télécharger.
• Ni analyse, ni publicité, ni suivi. Open source sous licence Apache-2.0.
• Les clés d'API sont stockées sans chiffrement dans le stockage de l'extension ; utilisez une clé avec plafond de dépenses.

LANGUES
L'interface est disponible en dix langues, et les explications peuvent être rédigées en 16 langues.

Code source, politique de confidentialité et assistance : voir les liens de cette page.
