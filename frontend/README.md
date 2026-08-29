# WorkBridge ETH — Frontend

Static single-page frontend. No build step. Drop the whole `frontend/` folder
into any static host.

## Quick start (local)

1. Start the backend (`workbridge-eth-backend/`) per its README — it runs on `:5000`.
2. Serve this folder with any static server. Easiest:
   ```bash
   cd frontend
   python3 -m http.server 3000
   ```
3. Open `http://localhost:3000`.
4. `config.js` already points at `http://localhost:5000/api` — change it if needed.

## Deploying to GitHub Pages

The "links don't work, only the name shows" problem on GitHub Pages is caused
by one of these — usually a combination:

1. **Repo-root or `/docs` serving.** GitHub Pages serves your site at
   `https://<user>.github.io/<repo>/`. Any path that isn't `index.html` will
   404 on hard refresh. The included `404.html` fixes this.
2. **Absolute paths in the HTML.** The `index.html` already uses relative
   paths (`js/api.js`, `assets/logo-mark.png`). Don't change them to `/js/...`.
3. **API CORS.** The backend must allow your GitHub Pages origin. In the
   backend's `.env` set `CLIENT_URL=https://<user>.github.io,<repo>`.
4. **API base URL.** Edit `config.js` to point at your deployed backend
   (e.g. `https://api.workbridge-eth.com/api`).

### Step-by-step for GitHub Pages

1. Push this `frontend/` folder to a GitHub repo. (You can put it at the repo
   root, or in a `/docs` folder — configure Pages source in repo Settings.)
2. Edit `config.js` to your real backend URL.
3. Enable Pages: Settings → Pages → Source → `main` branch, `/` (root) or
   `/docs` depending on where you put the files. Save.
4. Wait a minute. Visit `https://<user>.github.io/<repo>/`.
5. Hard-refresh (Ctrl/Cmd-Shift-R) if you see a cached old version.

### Deploying to Netlify / Vercel / Cloudflare Pages

Same steps. No build needed. The `404.html` works there too.

## Files

```
frontend/
├── index.html         # The whole app (single file, with inline CSS + JS)
├── js/
│   └── api.js         # API client — talks to the backend
├── config.js          # Edit this to set your backend URL
├── config.example.js  # Example config — copy to config.js
├── 404.html           # GitHub Pages SPA fallback
├── .nojekyll          # Tells GitHub Pages not to run Jekyll
└── assets/
    ├── logo-mark.png       # Square WB monogram (used in nav + footer)
    └── loading-banner.png  # Full WorkBridge ETH branding (used on splash)
```
