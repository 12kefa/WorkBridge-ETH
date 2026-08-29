# WorkBridge ETH — Backend API

Production-ready Node.js/Express backend for Ethiopia's next-generation opportunity platform.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express.js |
| Database | PostgreSQL 14+ |
| Driver | `pg` (raw SQL with parameterized queries) |
| Auth | JWT access + refresh tokens (hashed at rest), bcrypt |
| 2FA | TOTP via `speakeasy` + `qrcode` |
| Validation | Hand-rolled validators per controller |
| Security | Helmet, express-rate-limit (global + per-endpoint), CORS allowlist |
| Real-time | (Socket.io hook ready, not wired) |
| File Upload | Multer + Cloudinary |
| Email | Nodemailer (with a console-logging fallback when SMTP is not configured) |

## Project Structure

```
workbridge-eth-backend/
├── config/
│   ├── database.js          # pg.Pool + query() + withTransaction()
│   ├── migrate.js           # Idempotent schema migration (run on boot)
│   └── cloudinary.js        # Cloudinary uploader
├── controllers/
│   ├── auth.controller.js   # Register, login, refresh, OTP, forgot/reset password
│   ├── job.controller.js    # Jobs + applications
│   ├── service.controller.js # Services + orders
│   ├── dating.controller.js # Profiles, likes, matches, blocks
│   ├── message.controller.js # Conversation-grouped chat
│   └── user.controller.js   # Profile CRUD, public directory
├── middleware/
│   ├── auth.js              # protect / adminOnly / employerOnly / optionalAuth
│   ├── errorHandler.js      # notFound + errorHandler
│   ├── upload.js            # Multer memory storage
│   └── validate.js          # (legacy; controllers do their own validation now)
├── routes/
│   ├── auth.js
│   ├── jobs.js
│   ├── services.js
│   ├── dating.js
│   ├── messages.js
│   ├── users.js
│   └── admin.js
├── utils/
│   ├── email.js             # sendEmail() with dev-mode console fallback
│   └── otp.js               # generateOTP, verifyOTP, generateQrDataURL
├── server.js                # Entry point
├── .env.example
└── package.json
```

## Quick Start

### 1. Install PostgreSQL 14+
```bash
# Ubuntu/Debian
sudo apt update && sudo apt install postgresql postgresql-contrib

# macOS
brew install postgresql

# Windows
# Download from https://www.postgresql.org/download/windows/
```

### 2. Create database + user
```bash
sudo -u postgres psql
CREATE DATABASE workbridge_eth;
CREATE USER wb_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE workbridge_eth TO wb_user;
\q
```

### 3. Configure environment
```bash
cd workbridge-eth-backend
cp .env.example .env
# Edit .env:
#   - Set DB_PASSWORD to the password you just created
#   - Set JWT_SECRET to a strong random value: `openssl rand -base64 48`
#   - Optionally set SMTP_* for real email delivery
```

The server **refuses to start** if `JWT_SECRET` is missing, too short, or set to a
known default value.

### 4. Install + run
```bash
npm install
npm run dev      # development with auto-reload
# or
npm start        # production
```

On boot the server:
1. Connects to PostgreSQL.
2. Runs all `CREATE TABLE IF NOT EXISTS` statements (idempotent).
3. Starts listening on `PORT` (default 5000).

Migrations are automatic — there is no separate `db:migrate` step.

## API Endpoints

### Authentication — `/api/auth`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | — | Create account (10 req / 15 min limit) |
| POST | `/login` | — | Sign in (10 req / 15 min limit) |
| POST | `/refresh-token` | — | Rotate refresh + issue new access token |
| POST | `/forgot-password` | — | Send password reset link |
| POST | `/reset-password` | — | Reset with token from email |
| GET | `/verify-email?token=` | — | Verify email address |
| GET | `/me` | required | Current user |
| PATCH | `/me` | required | Update own profile (whitelisted fields) |
| DELETE | `/me` | required | Deactivate my own account (soft delete) and sign out everywhere |
| POST | `/logout` | required | Revoke all refresh tokens |
| POST | `/otp/setup` | required | Begin TOTP enrollment, get QR code |
| POST | `/otp/verify` | required | Confirm TOTP code, enable 2FA |

### Jobs — `/api/jobs`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | — | List active jobs (filters: category, location, search, skills, salary, is_featured) |
| GET | `/:id` | optional | Job detail (increments views, marks `has_applied` if logged in) |
| POST | `/` | employer | Create job |
| PUT | `/:id` | employer / owner | Update job |
| DELETE | `/:id` | employer / owner | Delete job |
| POST | `/:id/apply` | required | Apply to a job |
| GET | `/applications` | required | Applications I received (employer) or sent (anyone) |
| GET | `/my-applications` | required | Alias for `/applications` |
| PUT | `/applications/:id` | employer | Update application status |

### Services — `/api/services`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | — | List active services |
| POST | `/` | required | Create service listing |
| GET | `/:id` | optional | Service detail |
| PUT | `/:id` | owner | Update listing |
| DELETE | `/:id` | owner | Delete listing |
| POST | `/:id/order` | required | Order a service |
| GET | `/orders/list?as=provider` | required | My orders (as buyer or provider) |
| PUT | `/orders/:orderId` | required | Update order status |

### Dating — `/api/dating`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/profile` | required | Create dating profile |
| GET | `/profile` | required | My profile |
| PATCH | `/profile` | required | Update my profile |
| GET | `/browse` | required | Browse other profiles (excludes already-liked) |
| POST | `/like/:userId` | required | Like a user (returns is_match) |
| GET | `/matches` | required | My matches |
| GET | `/likes` | required | People who liked me that I haven't matched with |
| POST | `/block/:userId` | required | Block a user |

### Messages — `/api/messages`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/conversations` | required | All my conversations, last message preview, unread count |
| GET | `/with/:userId` | required | Message thread with a specific user (paginated) |
| POST | `/` | required | Send a message |
| POST | `/read` | required | Mark all messages from a sender as read |

### Users — `/api/users`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | — | Browse public users (filters: user_type, city, skills, search) |
| GET | `/:id` | — | Public profile |
| GET | `/me/profile` | required | My full profile |
| PATCH | `/me/profile` | required | Update my profile (whitelisted) |
| POST | `/me/change-password` | required | Change password (revokes all refresh tokens) |
| POST | `/me/photo` | required | Upload profile photo (multipart, field `photo`, max 5MB, JPEG/PNG/WebP/GIF). Uploads to Cloudinary and saves the URL. Requires `CLOUDINARY_*` env vars. |

### Admin — `/api/admin` (admin role required)
| Method | Path | Description |
|---|---|---|
| GET | `/stats` | Dashboard counts + total revenue |
| GET | `/users` | List all users (paginated, searchable) |
| PUT | `/users/:id/verify` | Mark user as identity-verified |
| PUT | `/users/:id/deactivate` | Deactivate user (revokes tokens) |
| PUT | `/users/:id/activate` | Reactivate user |
| POST | `/users/:id/premium` | Grant/revoke premium membership |
| GET | `/reports` | List abuse reports by status |

## Security Features

- ✅ Password hashing with bcrypt (10 rounds — adjust via `BCRYPT_ROUNDS` in `auth.controller.js`)
- ✅ JWT access + refresh tokens; refresh tokens are stored hashed (sha256) and rotated
- ✅ Login lockout: 5 failed attempts → 15-minute lock
- ✅ Role-based access control (admin / employer / model / etc.)
- ✅ Two-factor authentication (TOTP)
- ✅ Helmet security headers
- ✅ CORS allowlist (configurable)
- ✅ Rate limiting: 200 req / 15 min global; 10 req / 15 min on auth endpoints
- ✅ Field whitelisting on every UPDATE endpoint (no mass assignment)
- ✅ UUID validation on every `:id` param
- ✅ SQL injection protection (all queries are parameterized)
- ✅ `.env` validation: server refuses to boot with default `JWT_SECRET`
- ✅ Graceful shutdown on SIGTERM / SIGINT

## Environment Variables

See [`.env.example`](./.env.example). In production, prefer setting a single
`DATABASE_URL` connection string over the discrete `DB_*` vars — `config/database.js`
uses it automatically when present (this is the convention on Render, Railway, and
similar platforms).

## Deployment

A ready-to-use [Render](https://render.com) Blueprint is included at the repo
root (`../render.yaml`) — it provisions this API plus a managed Postgres
database together, with the schema migrating itself on first boot. See the
comments at the top of that file for the one-time setup steps. Any other
Node host works too, as long as it runs `npm install && npm start` with the
env vars above set.

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Production start |
| `npm run dev` | Dev start with nodemon |
| `npm run migrate` | Run migration once (already runs on boot) |

## Next Steps

1. **Socket.io** — add real-time push for messages, application updates, matches.
2. **More file uploads** — `POST /api/users/me/photo` covers the profile photo. CVs, `model_photos`, and `dating_photos` still need their own upload endpoints (same `uploadSingleImage` / `uploadToCloudinary` helpers, just a different DB column and, for the gallery fields, array-append instead of overwrite).
3. **Payments** — integrate Telebirr / CBE Birr / Chapa for commissions and premium upgrades.
4. **AI matching** — skill + preference vector for jobs and dating.
5. **Email templates** — move HTML into `utils/emailTemplates.js`.
6. **Tests** — Jest + supertest for the auth happy path, job create+apply, rate-limit trigger.

## License

MIT
