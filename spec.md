# Screenshot Area Capture — Specification

**Version :** MVP 1.0
**Type :** Extension navigateur
**Objectif :** Permettre à l’utilisateur de capturer rapidement une zone précise de l’écran et de copier automatiquement l’image dans le presse-papiers.

## 1. Fonctionnement principal

Le fonctionnement doit être extrêmement simple :

1. L’utilisateur clique sur l’icône de l’extension dans la barre du navigateur.
2. Le mode **sélection de zone** s’active immédiatement.
3. Le curseur devient un curseur de sélection.
4. L’utilisateur clique et maintient le bouton gauche de la souris.
5. Il déplace la souris pour créer un cadre de sélection.
6. Pendant le déplacement, un cadre visuel affiche exactement la zone sélectionnée.
7. L’utilisateur relâche le bouton.
8. La zone sélectionnée est immédiatement capturée.
9. L’image est automatiquement copiée dans le **presse-papiers système**.
10. L’utilisateur peut immédiatement faire `Ctrl + V` pour coller l’image dans Discord, WhatsApp Web, Photoshop, Figma, ChatGPT, etc.

**Aucune étape intermédiaire ne doit être nécessaire.**

---

## 2. UX de sélection

Lorsque le mode capture est actif :

* Ajouter un overlay au-dessus de la page.
* L’arrière-plan de la page devient légèrement assombri.
* La zone sélectionnée reste clairement visible.
* Afficher un cadre autour de la sélection.
* Le cadre doit suivre précisément le curseur.
* La sélection doit fonctionner dans toutes les directions :

  * haut → bas
  * bas → haut
  * gauche → droite
  * droite → gauche

### Exemple

```text
┌──────────────────────────────────────────────┐
│                                              │
│       zone de la page assombrie              │
│                                              │
│       ┌──────────────────────┐               │
│       │                      │               │
│       │   ZONE SÉLECTIONNÉE  │               │
│       │                      │               │
│       └──────────────────────┘               │
│                                              │
└──────────────────────────────────────────────┘
```

---

## 3. Capture

La capture doit correspondre **exactement aux pixels de la zone sélectionnée**.

La capture doit prendre en compte :

* position X/Y de la sélection ;
* largeur ;
* hauteur ;
* device pixel ratio ;
* zoom du navigateur ;
* résolution de l'écran.

L'image finale doit être générée au format :

**PNG**

avec transparence si nécessaire selon le contexte de capture.

---

## 4. Presse-papiers

Après la capture :

```text
Sélection
   ↓
Capture PNG
   ↓
Conversion Blob
   ↓
Clipboard API
   ↓
Image disponible avec Ctrl + V
```

Le comportement attendu est :

```text
Utilisateur relâche la souris
        ↓
Capture terminée
        ↓
Image copiée automatiquement
        ↓
Mode capture désactivé
        ↓
Utilisateur peut continuer son travail
```

Il ne faut **pas** demander :

* « Enregistrer l'image ? »
* « Télécharger ? »
* « Copier ? »
* « Confirmer ? »

La copie dans le presse-papiers est automatique.

---

## 5. Activation

### Clic sur l'extension

Un clic sur l'icône doit directement lancer le mode capture.

Il ne faut pas ouvrir une popup contenant des boutons inutiles.

```text
Click extension
      ↓
Capture mode ON
      ↓
Select area
      ↓
Capture
      ↓
Copy to clipboard
      ↓
Capture mode OFF
```

---

## 6. Annulation

L'utilisateur peut annuler la capture avec :

### `ESC`

Comportement :

```text
ESC
 ↓
Suppression de l'overlay
 ↓
Annulation de la sélection
 ↓
Retour à la page normale
```

Aucune image ne doit être copiée.

---

## 7. Sélection minimale

Empêcher les captures accidentelles.

Si :

```text
width < 5px
ou
height < 5px
```

alors la capture est annulée.

---

## 8. Curseur

Pendant le mode capture :

```text
cursor: crosshair
```

Le curseur doit clairement indiquer que l'utilisateur est en mode sélection.

---

## 9. Performance

Le mode capture doit être :

* instantané ;
* léger ;
* sans animation inutile ;
* sans popup ;
* sans serveur ;
* sans upload externe ;
* sans stockage cloud.

La capture doit être réalisée **localement sur la machine de l'utilisateur**.

---

## 10. Privacy

L'extension ne doit envoyer aucune capture vers un serveur.

Architecture :

```text
Browser
   │
   ├── Screen capture
   │
   ├── Area selection
   │
   ├── PNG generation
   │
   └── Clipboard
```

**Aucune donnée ne quitte l'appareil.**

---

## 11. Architecture recommandée

Pour Chrome / Chromium :

* Manifest V3
* Service Worker
* Content Script
* Chrome Screenshots / capture API selon les contraintes de l'extension
* Clipboard API
* HTML/CSS/JavaScript ou TypeScript

Structure recommandée :

```text
screenshot-extension/
│
├── manifest.json
│
├── src/
│   ├── background/
│   │   └── service-worker.ts
│   │
│   ├── content/
│   │   ├── selector.ts
│   │   ├── selector.css
│   │   └── capture.ts
│   │
│   └── utils/
│       ├── coordinates.ts
│       └── clipboard.ts
│
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
│
└── package.json
```

---

## 12. États de l'extension

L'extension possède trois états principaux :

### IDLE

```text
Extension inactive
Page normale
```

### SELECTING

```text
Overlay actif
Curseur crosshair
Sélection en cours
```

### CAPTURING

```text
Sélection terminée
Capture de l'écran
Conversion PNG
Copie Clipboard
```

Puis retour automatique à :

```text
IDLE
```

---

## 13. Contraintes importantes

Le MVP doit respecter strictement ces règles :

* **1 clic** sur l'extension pour commencer.
* **1 sélection** avec la souris.
* **0 popup** intermédiaire.
* **0 bouton "Save"**.
* **0 upload serveur**.
* **0 stockage cloud**.
* **0 étape supplémentaire**.
* Image automatiquement disponible dans `Ctrl + V`.
* `ESC` annule.
* La sélection doit être pixel-perfect.
* Fonctionnement fluide et rapide.

---

## 14. Critère de réussite

Le scénario suivant doit fonctionner :

```text
1. Je suis sur n'importe quelle page web.

2. Je clique sur l'icône de l'extension.

3. L'écran passe immédiatement en mode sélection.

4. Je clique à l'endroit où commence ma zone.

5. Je déplace ma souris.

6. Un cadre apparaît et représente exactement ma sélection.

7. Je relâche la souris.

8. L'image est automatiquement copiée.

9. Je vais dans une autre application.

10. Je fais Ctrl + V.

11. L'image apparaît directement.
```

### Résultat attendu

**Click → Select → Release → Ctrl+V**

Aucune autre interaction ne doit être nécessaire.
