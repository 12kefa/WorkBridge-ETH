# WorkBridge ETH

A multi-vertical platform for Ethiopia — jobs, freelance services, dating, and
modeling/talent — connected through one account system.

```
workbridge-eth/
├── frontend/               Static single-page app (vanilla HTML/CSS/JS). No build step.
├── workbridge-eth-backend/ Node.js/Express + PostgreSQL API.
├── render.yaml             One-click backend deploy (Render Blueprint: API + managed Postgres).
└── .github/workflows/      Auto-deploys frontend/ to GitHub Pages on push to main.
```

Each folder has its own README with full detail — start there for setup,
API reference, and deployment specifics:

- **[`workbridge-eth-backend/README.md`](./workbridge-eth-backend/README.md)** — tech stack, full API endpoint table, environment variables, security features, deployment.
- **[`frontend/README.md`](./frontend/README.md)** — local dev, GitHub Pages / Netlify / Vercel deployment, file layout.

## Run it locally

```bash
# 1. Backend
cd workbridge-eth-backend
cp .env.example .env        # then set DB_PASSWORD and JWT_SECRET
npm install
npm run dev                 # → http://localhost:5000

# 2. Frontend (separate terminal)
cd frontend
python3 -m http.server 3000 # → http://localhost:3000
# config.js already points at http://localhost:5000/api
```

## Deploy it

1. **Backend → [Render](https://render.com):** push this repo to GitHub, then in the Render
   Dashboard choose *New → Blueprint* and point it at the repo. `render.yaml`
   provisions the API and a managed Postgres database together; the schema
   migrates itself on first boot.
2. **Frontend → GitHub Pages:** already automated. Enable it once via
   *Settings → Pages → Source → GitHub Actions*, then every push to `main`
   that touches `frontend/` redeploys it via `.github/workflows/deploy-pages.yml`.
3. Edit `frontend/config.js` to point at your deployed backend URL, and set
   `CLIENT_URL` in the backend's environment to your Pages URL (CORS).

## What's built vs. what's next

Auth, jobs, freelance services, messaging, and profile management are wired
end-to-end — real database, real API calls, no mock data. Dating and
modeling/talent have complete, tested backend APIs (browse, like, match,
CRUD) but **no dashboard UI yet** — that's the next feature to build, not a
bug. Same for the admin panel: the API exists (`/api/admin/*`), the UI
doesn't. See the backend README's "Next Steps" for the rest (real-time
messaging via Socket.io, payments, additional photo-upload endpoints for
CVs/galleries).

---

Built by **Nexora Tech**. Questions or support: [tesfaykflay75@gmail.com](mailto:tesfaykflay75@gmail.com) · [@go_do369](https://t.me/go_do369) on Telegram.
