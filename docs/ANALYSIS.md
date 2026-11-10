# Analysis

This file records what the customer app and the admin panel actually do, and how the backend resolves disagreements. The app's real behavior wins over any blueprint note. Response shapes follow the admin UI and `tsadmin/docs/ADMIN_API_CONTRACT.md`, except where this build's rules require a smaller contract (one admin, no roles, no client-supplied try-on URLs). Those exceptions are listed below and the admin contract in `tsadmin` is updated in Phase 5 to match.

## Where the code lives

| Path in the brief | What is actually on disk |
| --- | --- |
| `C:\hityam\TS\tripuraasangrahah` | React Native customer app. This is the app that was read. |
| `C:\hityam\TS\tripuraaadmin` | Only `tsconfig.node.json`. No UI. |
| `C:\hityam\TS\tsadmin` | The React + Vite admin panel with mock services and `docs/ADMIN_API_CONTRACT.md`. Phase 5 integrates this project. |
| `C:\hityam\TS\tstryon` | A separate kiosk demo. It is not one of the two clients. |

There is no blueprint file in the three project folders. The only blueprint-style text is the "Automated AI Pipeline" section of `tsadmin/README.md`, which mentions PostgreSQL-style approval queues, NSFW toggles, and multiple staff roles. The running admin UI and the customer app do not implement that. The customer app wins: try-on is a local Virtual Drape / Flat Weave toggle, looks are saved per saree, and there is no payment or order object.

## Customer app

Navigation (`src/navigation/appNavigator.jsx`):

- Stack starts on `MainTabs` today (no session check). Splash, Login, Register, and Otp exist but are not the initial route.
- Private screens: Home, Collections, Wardrobe, Account (tabs), plus Faq, TermsOfService, UserPolicy, CardDetail, TryOnTab.
- Phase 4 changes the initial route to Splash, which calls `GET /system/config` and restores a session. UI layout stays the same.

Auth screens collect:

- Register: `fullName` (field label "Full Name"), `email`, phone as `"+91 98765 43210"` (country code + space + national number), password. The screen blocks submit unless length is at least 8 and there is one special character. Uppercase, lowercase, and a digit are shown as strength hints but are not required to submit. Backend password rule matches that submit rule.
- Login: `email`, `password` (client asks for 6 characters; backend still requires the register rule only when setting a password).
- OTP: 6 digits. Resend cooldown on the client is 30 seconds. Forgot-password currently opens the same OTP screen and then sends the user into the app. Phase 4 adds a reset-password step after that OTP, because the API needs a new password and the current screen never collects one.
- No token storage exists. Phase 4 keeps the access token in memory and the refresh token in `react-native-keychain` (this app is bare React Native, not Expo, so Expo SecureStore is not installed).

### Saree shape (`src/data/sareeCatalog.js`)

```text
id: "saree-1"
brand, title
price: "₹28,500"          // display string
numericPrice: 28500
mrp: "₹34,000"
category: "sarees" | "katan" | "bridal" | "tissue" | "paithani"
weave, fabric, zari, origin, colorTheme
images: ImageSource[]
image: primary
tryOnImage: portrait/drape asset
description
stock: "In Stock" | "1 Heritage Weave Left" | ...
```

`TRY_ON_SAREES` renames `title` to `name` and joins fabric + zari. Screens mostly use the master shape (`title`, `price`, `image`, `tryOnImage`).

Sort ids used by the catalog UI: `featured`, `price_asc`, `price_desc`. Quick chips (`pure_zari`, `handloom`, `wedding`, `under_30k`) are client-side filters on weave/zari/category/price. The API search and category query cover the server-side needs; chips keep filtering the loaded list.

### Categories (`src/data/categories.js`)

`all` (All), `sarees` (Kanchipuram), `katan` (Banarasi), `bridal` (Bridal), `tissue` (Tissue), `paithani` (Paithani). `all` is a client filter, not a stored category.

### Try-on (`tryOnScreen.jsx`, `tryOnContext.js`, `tryOnPhotoModal.jsx`)

- The screen receives `route.params.product` or `route.params.sareeId`.
- `viewMode` is `drape` or `flat`. Drape shows `tryOnImage` (falling back to `image`). Flat shows `image`. Switching to drape plays an 850ms scan animation. That toggle stays local. It does not call the network.
- The photo modal's "Take Photo" and "Choose Photo" currently swap in bundled assets. They do not open the camera. Phase 4 wires both actions to `react-native-image-picker`, uploads the file, and stores the returned profile.
- Save look is idempotent per `sareeId`. The saved object is `{ id, sareeId, sareeTitle, sareePrice, weave, drapeImage, flatImage, userPhotoSource, savedAt }`.
- There is no polling today. The scan animation pretends the drape is ready. Phase 4 keeps the animation, then polls `GET /try-on/jobs/:id` every 2.5s until completed, failed, or 2 minutes.

### Other client state

- Wishlist is a map `{ "saree-1": true }` in `wardrobeContext.js`, seeded with saree-1, saree-3, saree-5. Items are resolved against the in-memory catalog.
- Profile default: name `Samyuktha Rao`, email `samyuktha.rao@heritage.in`, phone `+91 98765 43210`.
- FAQ items: `{ id, question, answer }`.
- Legal: `{ title, content }[]` for terms and policy.
- Store: name, tagline, two address lines, landmark, timings, latitude, longitude, mapsQuery.
- Support: whatsapp phone + message, instagram username, helpline phone + display label.
- Card detail shares a product message. There is no checkout and no enquiry form. `POST /orders/enquiry` exists for the account/detail "enquire" action added in Phase 4 without a new visual system. Payments are not implemented.

## Screen to API

| Screen | API |
| --- | --- |
| Splash | `GET /api/v1/system/config`, then refresh if a refresh token exists |
| Register | `POST /api/v1/auth/register` then OTP screen |
| OTP (register) | `POST /api/v1/auth/verify-otp`, `POST /api/v1/auth/resend-otp` |
| Login | `POST /api/v1/auth/login` |
| Forgot password | `POST /api/v1/auth/forgot-password`, verify OTP, `POST /api/v1/auth/reset-password` |
| Home, Collections | `GET /api/v1/categories`, `GET /api/v1/sarees` |
| Card detail | `GET /api/v1/sarees/:id`, wishlist toggle, `POST /api/v1/orders/enquiry` |
| Try-on | upload photo, `POST /api/v1/try-on/generate-drape`, poll `GET /api/v1/try-on/jobs/:id`, save/delete look |
| Wardrobe | wishlist and `GET /api/v1/users/me/try-on-looks` |
| Account | `GET/PUT/DELETE /api/v1/users/me`, logout |
| FAQ, Terms, Policy, store, support | content endpoints |

Customer errors use `{ success:false, error:{ code, message, details? } }`.

Catalog items inside `data.items` use the saree shape above so existing cards can render `title`, `price`, `image`, and `tryOnImage`. `image` and `tryOnImage` are URLs. The app already accepts `{ uri }` once the shared image helper is applied.

## Admin page to API

The UI calls paths from `src/services/*`. Most of them omit `/api/v1` (`/admin/sarees`). Auth already uses `/api/v1/admin/auth/login`. Phase 5 points every call at `/api/v1/admin/...` and appends query strings (today the real-fetch branch drops the filter params; only the mock handler sees them).

| Page | API |
| --- | --- |
| Login | `POST /api/v1/admin/auth/login` |
| Forgot password | `POST /api/v1/admin/auth/forgot-password` |
| Dashboard | `GET /api/v1/admin/dashboard/stats` |
| Sarees | list, get, create, update, delete, duplicate, bulk |
| Categories | list, create, update, delete, `PUT /api/v1/admin/categories/reorder` |
| Enquiries | list, get, `PUT .../status`, notes, export `{ csv, filename }` |
| Customers | list `{ items, total, page, totalPages }`, detail, `PUT .../block` |
| Try-on | jobs list, credits, system try-on settings |
| Content | hero, store, support, faq, legal |
| Settings | `GET/PUT /api/v1/admin/system-config`, change password |
| Audit | `GET /api/v1/admin/audit-logs` |

List payloads that the pages actually read:

```text
data.items, data.total, data.page, data.totalPages
data.counts.totalUsers | totalSarees | openEnquiries | savedLooks | lowStockCount
data.trends.monthlyTrends[{ month, enquiries, tryOnLooks, wishlistSaves }]
data.trends.categoryBreakdown[{ category, count, value }]
data.recentEnquiries, data.lowStockSarees
```

The contract example names the trend array `monthlyEnquiries` with `{ month, enquiries, conversions }`. The dashboard component reads `trends.monthlyTrends`. The backend sends `monthlyTrends` (what the page renders) and also `monthlyEnquiries` as an alias with `conversions` set from confirmed enquiries, so both readers work.

Saree writes use `numericPrice` and `numericMrp`. Responses include those plus formatted `price` and `mrp`.

Enquiry export is JSON `{ csv, filename }` because `EnquiriesPage` builds a Blob from `res.data.csv`. It is not a raw CSV response.

## Disagreements and resolutions

| Topic | Contract or blueprint | This build |
| --- | --- | --- |
| Database | Admin README talks about a generic backend. The brief says MongoDB, not PostgreSQL. | MongoDB with Mongoose. |
| Roles | Login user includes `role`. `PUT /admin/users/:id/role`. Menus have role flags. | One admin. No role field, no role endpoint. Login user is `{ id, name, email, avatar }`. Customer tokens are rejected on `/admin`. |
| Block user | `PUT /admin/users/:id/block` with `{ isBlocked, reason }` | That shape is kept because the UI already sends it. `PATCH .../block` and `PATCH .../unblock` from the brief are also mounted. |
| Enquiry status | Contract `PUT`. Brief `PATCH`. | `PUT`, matching the service. |
| Categories order | Contract `PUT /admin/categories/reorder`. Brief `PUT /admin/categories/order`. | `reorder`, matching the service. |
| Content paths | Brief uses `store-address` and `support-channels`. Admin uses `/content/store` and `/content/support`. | Public customer routes use the brief names. Admin routes use the contract names. Same documents. |
| Legal | Brief `:slug`. Contract `:type` (`terms` or `policy`). | Both names accept `terms` and `policy`. Body is sections plus markdown. |
| Feature flag | Brief `featureFlags.tryOnEnabled`. Contract `enableTryOn`. | Stored as `tryOnEnabled`. Admin GET/PUT accepts and returns both names. |
| Try-on admin | Contract has `/admin/fashn/logs` (with portrait URLs), `/admin/fashn/config` (includes api key), and `/admin/fashn/run-test` (client image URL). | Not implemented. They would expose portraits or let the browser send an image URL. Replaced by `GET /admin/try-on/jobs` (no image payloads), `GET /admin/try-on/credits`, and try-on fields on system config. Phase 5 changes the Try-On page to those routes. |
| FASHN api key in admin config | Contract PUT sends `apiKey`. | The key stays in the environment only. The settings page cannot read or write it. |
| Dashboard credits | Not in the original stats payload. | Added as `data.tryOn` and `data.fashn` without removing the existing counts. |
| Audit actor | Contract nests `{ id, name, role }`. The mock list uses flat `actorName`. | Response includes both `actor: { id, name }` and `actorName`, with no role. |
| Customer login enumeration | Brief: identical failure for unknown email and bad password. App also needs a blocked-account message. | Unknown email and wrong password share `INVALID_CREDENTIALS`. A correct password on a blocked account returns `ACCOUNT_BLOCKED`. Forgot-password is always the same 200 message. |
| OutOfCredits HTTP code | Brief says 402. FASHN docs list OutOfCredits as 429. | Both 402 and 429 `OutOfCredits` map to `TRYON_UNAVAILABLE` and are not retried. |
| `tripuraaadmin` folder | Brief says the admin UI is there. | The UI that exists is `tsadmin`. That is the project Phase 5 edits. |

## Open questions

None that block the build. Assumptions:

- Bare React Native uses `react-native-keychain`, not Expo SecureStore.
- Android emulator base URL is `http://10.0.2.2:5000/api/v1`. A physical device needs the machine's LAN IP in `src/config/api.js`.
- Seed product photos are remote URLs (the same kind the admin mock already uses) because the app's `require()` assets are not files the API can host.
- `FASHN_API_KEY` is not in `.env` at the time of analysis. Live try-on quality cannot be claimed until that key is present.
- Payments, shipping capture, and push notifications are out of scope. Enquiries are the order path.
