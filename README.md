# Tripuraa Sangrahah API

Node.js API for the Tripuraa Sangrahah customer app and the single-admin panel. It serves the handloom catalog, customer accounts, enquiries, and the async AI drape studio.

## Setup

1. Install Node.js 22.
2. Copy `.env.example` to `.env` and set `MONGODB_URI` and `JWT_ACCESS_SECRET` (at least 32 bytes).
3. Install and prepare data:

```bash
npm install
npm run seed
npm run create-admin
```

`create-admin` reads `ADMIN_EMAIL` and `ADMIN_PASSWORD`. It creates the one admin account. Run it again only with `--reset-password` to change that password. There is no HTTP route that creates a second admin.

```bash
npm run dev
```

The API listens on `PORT` (default 5000). Routes are under `/api/v1`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm start` | Production server |
| `npm run dev` | Restart on file changes |
| `npm test` | Jest, in-memory MongoDB, mock try-on |
| `npm run test:watch` | Jest watch mode |
| `npm run seed` | Idempotent catalog, FAQ, legal, store, and system config |
| `npm run create-admin` | Create the single admin, or reset with `--reset-password` |
| `npm run lint` | ESLint |

## Environment

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_ACCESS_SECRET` | HS256 secret, 32 bytes or more |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | Optional RS256 key pair. When both are set they replace the HMAC secret |
| `CORS_ORIGINS` | Comma-separated app origins |
| `ADMIN_ORIGIN` | Admin panel origin. Cookies and credentials are allowed only for this origin |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Outbound mail. In development with no host, the OTP is written to the server log. Production refuses to send without SMTP |
| `FASHN_API_KEY` | FASHN API key. Never returned by the API |
| `FASHN_MODEL` | `tryon-v1.6` (default) or `tryon-max` |
| `TRYON_PROVIDER` | `fashn` or `mock`. Empty uses `fashn` when a key is set. In production with no key, try-on stays off and the rest of the API still boots |
| `ALLOW_MOCK_TRYON` | Must be `true` to boot the mock provider in production |
| `PUBLIC_BASE_URL` | Public origin. When set, FASHN is given a webhook URL |
| `WEBHOOK_SECRET` | Query secret checked on `POST /api/v1/webhooks/fashn` |
| `FASHN_LOW_CREDIT_THRESHOLD` | Dashboard warning level |
| `STORAGE_DRIVER` | `local` or `s3` |
| `UPLOAD_DIR` | Local upload folder |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL` | S3 or Cloudflare R2 |
| `TRUST_PROXY` | Set `true` behind a reverse proxy. Production defaults to `true` when this is left empty |
| `TRYON_RENDER_RETENTION_DAYS` | Unsaved renders older than this are deleted on boot |
| `PORTRAIT_MAX_BYTES` / `PRODUCT_MAX_BYTES` | Upload size limits |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Used only by `npm run create-admin` |

## Customer API

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/api/v1/health`, `/api/v1/health/ready` | Public |
| GET | `/api/v1/system/config` | Public |
| GET | `/api/v1/content/hero`, `/store-address`, `/support-channels`, `/faq` | Public |
| GET | `/api/v1/legal/:slug` | Public. `terms` or `policy` |
| GET | `/api/v1/categories`, `/api/v1/sarees`, `/api/v1/sarees/:id` | Public |
| POST | `/api/v1/auth/register`, `/verify-otp`, `/resend-otp`, `/login`, `/refresh`, `/logout`, `/forgot-password`, `/reset-password` | Public |
| POST | `/api/v1/auth/logout-all` | Customer |
| GET, PUT, DELETE | `/api/v1/users/me` | Customer |
| GET, POST, DELETE | `/api/v1/users/me/wishlist/:sareeId` | Customer |
| POST | `/api/v1/orders/enquiry` | Customer |
| GET | `/api/v1/users/me/enquiries` | Customer |
| POST | `/api/v1/try-on/upload-photo`, `/generate-drape` | Customer |
| GET | `/api/v1/try-on/jobs/:id` | Customer, owner only |
| GET, POST, DELETE | `/api/v1/users/me/drape-profiles`, `/try-on-looks` | Customer |
| GET | `/api/v1/media/access?token=` | Signed token |

Customer access tokens last 15 minutes and use audience `app`. Refresh tokens last 30 days, rotate on use, and revoke the whole family if a used token is presented again.

## Admin API

All `/api/v1/admin` routes except login, refresh, forgot-password, and reset-password require an admin access token (audience `admin`). A customer token is rejected.

| Method | Path |
| --- | --- |
| POST | `/admin/auth/login`, `/refresh`, `/forgot-password`, `/reset-password`, `/logout` |
| GET | `/admin/auth/me` |
| PUT | `/admin/auth/change-password` |
| GET | `/admin/dashboard/stats` |
| GET, POST, PUT, DELETE | `/admin/sarees` plus `/bulk`, `/duplicate`, and image routes |
| GET, POST, PUT, DELETE | `/admin/categories` and `PUT /admin/categories/reorder` |
| GET, PUT, POST | `/admin/enquiries`, status, notes, and `/export` |
| GET | `/admin/users` and block / unblock |
| GET, PATCH, DELETE | `/admin/looks` |
| GET | `/admin/try-on/jobs`, `/admin/try-on/credits` |
| GET, PUT | `/admin/content/hero`, `/store`, `/support`, `/faq`, `/legal/:type` |
| GET, PUT | `/admin/system-config` |
| GET | `/admin/audit-logs` |

Admin refresh uses an httpOnly cookie on `/api/v1/admin/auth`. Refresh requests must send `X-Requested-With: XMLHttpRequest`. The cookie origin must be `ADMIN_ORIGIN`.

## Try-on

`POST /try-on/generate-drape` checks that try-on is enabled, the daily quota, the per-user rate, that the saree is active, and that the portrait belongs to the caller. A repeated request for the same person, saree, and model returns the saved result and does not call FASHN. A new request returns `202` with a job id.

An in-process worker resumes queued jobs after a restart. It keeps at most 6 runs in flight and spaces FASHN `/run` and `/status` calls. The worker downloads the finished image into private storage because FASHN removes its copy. Switch models with `FASHN_MODEL` or the admin system-config `tryOnModel` field (`tryon-v1.6` or `tryon-max`). Switch the provider with `TRYON_PROVIDER=mock` for local development without a key.

Portraits and renders are private. Saree photos can be public. The API never accepts an image URL from the client.

## Deployment

Build and run the container with the same environment variables as `.env`. Do not bake secrets into the image.

```bash
docker build -t tripuraa-api .
docker run --env-file .env -p 5000:5000 tripuraa-api
```

Put the process behind TLS and point `STORAGE_DRIVER=s3` at R2 or S3 in production. Local `uploads/` is wiped whenever the host restarts.

On Render, set these environment variables on the web service (do not commit them):

| Variable | Value |
| --- | --- |
| `MONGODB_URI` | Atlas connection string. Allow `0.0.0.0/0` in Atlas Network Access so Render can connect |
| `JWT_ACCESS_SECRET` | At least 32 random bytes |
| `PUBLIC_BASE_URL` | The Render URL, for example `https://tripuraabackend.onrender.com` |
| `ADMIN_ORIGIN` | The admin site origin |
| `CORS_ORIGINS` | Comma-separated app and admin origins |
| `FASHN_API_KEY` | Optional. Leave empty to boot without virtual try-on |

Set the health check path to `/api/v1/health`. The root path `/` also returns 200.

## Not included

Payments, shipping capture, and push notifications are not implemented. A customer enquiry is the order path. The admin panel does not store the FASHN API key; it stays in the environment.
