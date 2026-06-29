# BudgetFlow — Persoonlijk Budget Analyzer

Een complete, privacy-first budget analyzer app. Alle data wordt lokaal opgeslagen in je browser — geen server, geen account nodig.

## Functionaliteiten

- **Dashboard** — KPI's, cashflow chart, donut chart, budget health score, burn rate & projectie
- **Transacties** — Toevoegen, filteren, zoeken, sorteren en exporteren als CSV
- **Analytics** — Inkomsten vs uitgaven over tijd, categorie trends, spaarquote, weekdag patroon + automatische inzichten
- **Budgetten** — Stel limieten in per categorie met voortgangsbalken
- **Spaardoelen** — Definieer doelen met datum en volg je voortgang
- **Instellingen** — Licht/donker thema, valuta keuze, demo data, CSV export

## Deployen op Vercel

### Stap 1 — GitHub repo aanmaken
1. Ga naar [github.com](https://github.com) en log in
2. Klik op **"New repository"** (groene knop rechtsboven)
3. Geef het een naam, bijv. `budget-analyzer`
4. Laat alles op default staan → klik **"Create repository"**

### Stap 2 — Bestanden uploaden
1. In je nieuwe lege repo, klik op **"Add file" → "Upload files"**
2. Sleep alle bestanden hierheen:
   - `index.html`
   - `style.css`
   - `app.js`
   - `vercel.json`
   - `README.md`
3. Klik **"Commit changes"**

### Stap 3 — Koppelen aan Vercel
1. Ga naar [vercel.com](https://vercel.com) en log in (of maak gratis account)
2. Klik **"Add New Project"**
3. Klik **"Import"** naast je GitHub repo
4. Laat alle instellingen op default → klik **"Deploy"**
5. Na ~30 seconden is je app live op een `*.vercel.app` URL

### Klaar! 🎉
Elke keer dat je een bestand aanpast en naar GitHub uploadt, deployt Vercel automatisch opnieuw.

## Lokaal testen
Open gewoon `index.html` in je browser — geen installatie nodig.

## Tech stack
- Vanilla HTML, CSS, JavaScript — geen framework, geen build-stap
- [Chart.js](https://www.chartjs.org/) voor grafieken
- `localStorage` voor data persistentie
- Google Fonts (Space Grotesk + Inter)
