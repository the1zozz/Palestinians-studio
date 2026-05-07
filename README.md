# Remember Their Names — Palestinian Martyrs Memorial

> A visual memorial for 60,199 Palestinians killed in Gaza between 7 Oct 2023 and 31 Jul 2025.
> Each star is a name. Each name was a life.

🔗 **Live site:** https://the1zozz.github.io/Palestinians-studio/

---

## Overview

This is an Angular 20 application that renders every documented Palestinian martyr as a shining star on a canvas. Moving your cursor over a star reveals the person's name, age, and date of birth. The project is inspired by [I Am Not a Number](https://i-am-not-a-number-palestine.github.io/).

---

## Features

| Feature | Description |
|---|---|
| ⭐ WebGL star field | 60,000+ particles rendered via custom GLSL shaders with organic drift animation |
| 🖱️ Hover to reveal | Spatial grid hit-detection shows a name card on hover/touch |
| 🖼️ Background | Palestine photo with dark overlay so stars pop |
| 🔊 Background audio | Ambient audio with smooth fade-in/out and mute toggle |
| ℹ️ About panel | Context about the data source and the project |
| 📘 Facebook link | Direct link to the creator's Facebook profile |
| 📱 Responsive | Works on desktop and mobile |
| 🔍 SEO ready | Full meta tags, Open Graph, Twitter card, sitemap, robots.txt |
| 🚀 Auto-deploy | GitHub Actions deploys to GitHub Pages on every push to `main` |

---

## Data

The data comes from the **Gaza Ministry of Health** and was translated by [Iraq Body Count](https://iraqbodycount.org/). It is stored as a compact JSON array at `public/data.json`.

Each record has 5 fields:

```json
{ "n": "Name in English", "a": "الاسم بالعربي", "g": "Age", "b": "YYYY-MM-DD", "s": "m/f" }
```

The original spreadsheet is also included at `public/moh_2025-07-31 (1).xlsx`.

---

## Project Structure

```
src/
├── app/
│   ├── app.ts                          # Root component
│   ├── app.config.ts                   # App providers (HttpClient, BaseHref)
│   ├── app.routes.ts                   # Router (empty — single page)
│   ├── components/
│   │   └── star-field/
│   │       ├── star-field.component.ts  # WebGL engine + audio + hover logic
│   │       ├── star-field.component.html
│   │       └── star-field.component.css
│   └── services/
│       └── martyrs-data.service.ts     # Loads data.json via HttpClient
├── index.html                          # SEO meta tags, fonts
└── styles.css                          # Global reset

public/
├── data.json          # 60,199 martyr records
├── palastine.jpg      # Background image
├── audio.m4a          # Background ambient audio
├── favicon.svg        # Palestinian flag icon
├── sitemap.xml        # For Google indexing
└── robots.txt         # Search engine instructions

.github/
└── workflows/
    └── deploy.yml     # GitHub Actions CI/CD pipeline
```

---

## How the WebGL Star Field Works

The particle system is built from scratch using raw WebGL (no Three.js or other libraries):

1. **Vertex shader** — positions each star and applies a sine/cosine drift for organic floating movement
2. **Fragment shader** — renders each point as a soft glowing circle with a warm white-to-gold gradient
3. **Spatial grid** — the canvas is divided into cells matching the particle layout, enabling O(1) hover detection across 60,000+ points
4. **Hover state** — the nearest star scales up and brightens with a smooth easing animation

---

## Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm start
# → http://localhost:4200
```

---

## Production Build

```bash
npm run build
# Output: dist/palestinians-studio/browser/
```

The production build sets `baseHref` to `/Palestinians-studio/` for GitHub Pages hosting.

---

## Deployment

Deployment is fully automated via GitHub Actions (`.github/workflows/deploy.yml`).

Every push to `main`:
1. Installs dependencies
2. Runs `ng build` (production)
3. Deploys `dist/palestinians-studio/browser/` to GitHub Pages

**One-time setup required:**
Go to `Settings → Pages → Source` and set it to **GitHub Actions**.

---

## Adding New Audio

Replace `public/audio.m4a` with any `.m4a` or `.mp3` file and update the filename in `star-field.component.ts`:

```ts
this.audio = new Audio(`${this.baseHref}your-file.m4a`);
```

---

## Tech Stack

- **Angular 20** — standalone components, signals, `@if` control flow
- **WebGL** — custom GLSL shaders, no canvas libraries
- **TypeScript 5.8**
- **Google Fonts** — Special Elite (title), Inter (body), Noto Kufi Arabic (Arabic text)
- **GitHub Actions** — CI/CD
- **GitHub Pages** — hosting

---

## Credits

- Data: [Gaza Ministry of Health](https://www.moh.gov.ps/) via [Iraq Body Count](https://iraqbodycount.org/)
- Inspired by: [I Am Not a Number](https://i-am-not-a-number-palestine.github.io/)
- Built by: [@the1zozz](https://www.facebook.com/zozz17)

---

*In memory of every soul. May they never be forgotten.*
