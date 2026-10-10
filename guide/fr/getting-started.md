# Premiers pas

Cinq minutes pour passer de rien à votre premier terme mémorisé.

> Ceci est la traduction française des [premiers pas en anglais](../getting-started.md). Les autres pages n'existent pour l'instant qu'en anglais : consultez la [documentation en anglais](../README.md).

## 1. Installer

Harkback est une extension Chrome (Manifest V3). Il n'y a pas encore de fiche sur le store : on la charge donc depuis les sources. Il vous faut Node 22 ou plus récent et [pnpm](https://pnpm.io).

```sh
git clone https://github.com/zestworks-io/harkback.git
cd harkback
pnpm install
pnpm --filter @harkback/extension build
```

Ouvrez `chrome://extensions`, activez le **Mode développeur**, choisissez **Charger l'extension non empaquetée** et sélectionnez `apps/extension/.output/chrome-mv3`. La page d'accueil de configuration s'ouvre toute seule.

Après avoir récupéré du nouveau code, relancez la compilation et cliquez sur l'icône de rechargement sur la carte de l'extension.

## 2. Connecter un modèle

Harkback n'a pas de serveur. Il lui faut un modèle pour écrire les explications, et c'est vous qui choisissez lequel. La page de configuration comporte trois étapes ; une étape terminée affiche ✓ et on peut cliquer dessus pour y revenir.

1. **Bienvenue.** Voyez un exemple de rappel et cliquez sur le terme souligné pour découvrir à quoi ressemble une explication. Aucun modèle n'est appelé.
2. **Confidentialité.** Lisez où va votre texte et cochez la case de consentement. **Suivant** reste désactivé tant que vous ne l'avez pas fait.
3. **Modèle.** Choisissez un fournisseur ; l'adresse se remplit. Collez une clé d'API si le fournisseur en demande une (Ollama et le modèle intégré de Chrome n'en ont pas besoin). Appuyez sur **Tester la connexion** : Chrome demande si Harkback peut joindre cette adresse ; autorisez-le. Une roue et « Connexion… » s'affichent pendant le test, et le bouton est désactivé jusqu'à sa fin. Appuyez ensuite sur **Terminer la configuration**.

**Le modèle intégré de Chrome (Gemini Nano)** n'a besoin ni d'adresse ni de clé. Le sélectionner affiche l'état du modèle et un bouton **Télécharger le modèle** ; **Terminer la configuration** attend la fin du téléchargement. C'est un petit modèle qui tourne sur votre ordinateur : attendez-vous à ce qu'il soit plus lent qu'un modèle dans le cloud, surtout à la première requête, avec des réponses plus simples. Il convient aux explications courtes.

Vous pourrez ajouter d'autres modèles et changer des options plus tard dans les réglages. Relancer la configuration met à jour le modèle que vous avez déjà ; elle n'en ajoute pas une deuxième copie.

L'option gratuite la plus simple est un modèle local [Ollama](https://ollama.com). Elle demande une étape de plus, car Ollama refuse les requêtes des extensions de navigateur tant que vous n'avez pas autorisé l'origine de l'extension. Le bouton de test affiche la commande exacte pour votre système. Voir [Modèles et fournisseurs](../models.md) pour tous les fournisseurs et pour exécuter un modèle sur un autre ordinateur de votre réseau domestique.

L'interface démarre en anglais. Vous pouvez changer sa langue, ainsi que celle des explications, dans la page de configuration ou les réglages.

## 3. Expliquer un terme

1. Ouvrez un article sur [arxiv.org](https://arxiv.org). Les pages arXiv sont analysées automatiquement.
2. Sélectionnez un terme, par exemple `LoRA`.
3. Cliquez sur **Expliquer** à côté de la sélection, ou appuyez sur `Alt+Shift+E`.
4. Lisez la réponse au fil de son arrivée. Une étiquette verte indique que la page elle-même définit le terme ; une étiquette jaune indique que la réponse vient des connaissances du modèle.
5. Appuyez sur **Compris** ou **Toujours confus**. Cette réponse est la première note du terme et décide du moment où Harkback vous le représentera en révision.

Autres façons de commencer : le menu contextuel du texte sélectionné, et une sélection faite au clavier ou au toucher.

## 4. Retrouver le terme

Ouvrez un autre article qui mentionne `LoRA`, `low-rank adaptation` ou `LoRAs`. Le terme est souligné. Survolez-le pour voir quand et où vous l'avez consulté, et ce que vous aviez compris alors. Vous pouvez le marquer comme retenu, l'expliquer de nouveau, comparer les deux usages ou le rendre muet.

## 5. Voir ce que vous avez

Ouvrez la page **Historique** (liée depuis les réglages et la configuration). Elle liste chaque terme par concept, avec une recherche, les conversations de suivi, une file de révision et un graphe des liens entre vos concepts. Vous pouvez aussi y exporter vos enregistrements et les restaurer depuis une sauvegarde.

## Lire autre chose que arXiv

- **Une page web :** cliquez une fois sur le bouton de la barre d'outils. Pour analyser un site automatiquement ensuite, ajoutez-le dans _Sites_ dans les réglages.
- **Un PDF :** cliquez sur le bouton de la barre d'outils sur le PDF. Les PDF d'arXiv s'ouvrent dans leur version HTML ; les autres s'ouvrent dans le lecteur de Harkback. Un PDF sur votre ordinateur demande deux autorisations la première fois ; voir [Dépannage](../troubleshooting.md#a-pdf-on-my-computer-will-not-open).
- **Quelque chose de confidentiel :** marquez d'abord le site ou la source comme sensible. Voir [Confidentialité et sources sensibles](../privacy.md).

## Ensuite

[Guide de l'utilisateur](../user-guide.md) · [Modèles et fournisseurs](../models.md) · [Dépannage](../troubleshooting.md)
