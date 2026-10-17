# CEDT Cinema

CEDT Cinema is a production-oriented cinema booking demo built as a modular monolith. It includes a responsive customer site, authentication, branch/movie/show browsing, a data-driven seat map, transaction-safe booking, five-minute holds, PromptPay QR generation, signed ticket QR codes, booking history, cinema administration, POS analytics, secure local media storage, automated expiry, and Docker environments.

The default UI language is Thai. It supports light, dark, and operating-system themes on desktop, tablet, and mobile.

## Architecture

```text
Browser
  └─ React + Vite + React Router + Tailwind CSS
       └─ /api and /media (same-origin)
            └─ Express modular API
                 ├─ auth/catalog/show controllers
                 ├─ BookingService + SeatLockService
                 ├─ PaymentQrService + TicketService
                 ├─ expiry worker + analytics aggregations
                 └─ Mongoose
                      └─ MongoDB single-node replica set
```

The API is one modular service rather than multiple microservices. MongoDB is the source of truth. The browser stores only the theme preference and local, pre-checkout seat selection.

## Tech stack

- React 19, Vite, JavaScript, React Router
- Tailwind CSS v4 plus responsive product CSS
- Recharts and Lucide icons
- Node.js, Express, Zod
- MongoDB, Mongoose transactions
- bcrypt password hashing, JWT in an HttpOnly cookie
- Helmet, credentialed CORS, rate limiting, Multer upload controls
- QRCode for payment and ticket QR generation
- Vitest, Supertest, mongodb-memory-server replica-set integration tests
- Docker, Docker Compose, Nginx

## Repository structure

```text
src/                       React application
  api/                     centralized credentialed API client
  components/              common, seat, layout, and admin components
  contexts/                auth, theme, and toast state
  layouts/                 customer and responsive admin shells
  pages/                   customer and admin route pages
  routes/                  browser route guards
server/src/
  config/                  validated environment and database retry
  controllers/             transport-only request handlers
  jobs/                    booking expiry worker
  middleware/              auth, roles, validation, uploads, errors
  models/                  Mongoose models and indexes
  routes/                  public, authenticated, and admin API routes
  seeds/                   idempotent demo seed
  services/                booking, locking, race, payment, ticket, show
  validators/              Zod request schemas
server/tests/              integration, authorization, and race tests
migdata/                   public media root
qrdata/                    reserved runtime QR directories
docker/                    automated replica-set bootstrap
nginx/                     production SPA/API reverse proxy
```

## Data models

- `User`: normalized unique username, bcrypt hash, display name, role, active state.
- `Movie`: titles, description, duration, genres, age rating, poster path, active/archive state.
- `Branch`: unique code, address, description, active state.
- `Theater`: branch reference, unique per-branch code, active state, data-driven row/seat layout.
- `Show`: movie/branch/theater references, UTC time window, show pricing, booking window, state.
- `ShowSeat`: one document per show/seat with available, held, or booked ownership.
- `Booking`: one user/show with multiple priced seats, server total, snapshots, expiry, payment, ticket.
- `Ticket`: unique booking, deterministic signed token hash, issued/used state.
- `Banner`: scheduled homepage content and image path.
- `Media`: safe server filename, path, MIME type, size, and owner.
- `RaceAttempt`: short-lived strict-race detection record with a TTL index.

Booking snapshots preserve movie, branch, theater, showtime, seats, and price after administrators edit live catalog data.

## Authentication and authorization

Registration normalizes usernames with Unicode NFKC plus lowercase comparison. `PunPon`, `punpon`, and `PUNPON` therefore cannot create separate accounts. Passwords are hashed with bcrypt cost 12 and never returned or logged.

Login issues a signed JWT using `JWT_SECRET`. Browser transport is an HttpOnly, SameSite=Lax cookie; production marks it Secure. `requireAuth` loads the active user from MongoDB on each protected request, and `requireRole('admin')` enforces administrative permission server-side. Frontend guards are only a navigation convenience.

Login and registration have dedicated rate limits. The general cinema API is not globally throttled by the strict auth limit.

## Booking flow

1. The public seat page requests only `GET /api/shows/:showId/seats`, normally about 300 projected documents.
2. Clicking seats changes a browser-local `Set`. It does not lock MongoDB data.
3. Checkout sends only `showId`, seat codes, and an idempotency key.
4. The API validates the show and booking window, loads the requested show seats, reads seat types and show prices, and ignores any client price authority.
5. A MongoDB transaction atomically acquires every seat and creates one holding booking.
6. The five-minute server hold starts only after checkout is pressed.
7. The protected checkout page polls every three seconds and displays the server expiry.
8. PromptPay QR generation leaves the booking pending. A trusted payment verifier is required for real settlement; development can explicitly enable debug confirmation to test seat finalization and ticket issuance.

Client double-clicks are covered by a unique `{ userId, clientRequestId }` booking index. Repeated QR requests reuse the existing booking without extending its expiry or issuing a ticket.

## Seat locking and concurrency

### Why double booking cannot occur

`ShowSeat` has a mandatory unique index on `{ showId: 1, seatCode: 1 }`, so a show cannot contain duplicate state documents for the same physical seat.

Availability is never implemented as read-then-save. `SeatLockService.acquire` performs an atomic conditional `findOneAndUpdate` whose query accepts only:

- `status: available`, or
- `status: held` with `holdExpiresAt <= serverNow`.

The same operation writes `heldByBookingId`, `heldByUserId`, and `holdExpiresAt`. Competing callers cannot both match that predicate.

Multi-seat checkout runs inside a MongoDB transaction. Seats are acquired in sorted order, and booking creation commits with all locks. If any seat conflicts, the transaction aborts; no earlier seat from that group remains held. The test suite launches two real concurrent HTTP checkouts against the same seat and asserts that only one active owner can exist.

QR generation checks seats whose `status`, `heldByBookingId`, `heldByUserId`, and unexpired hold match the booking, then transactionally records the pending state. `BookingFinalizationService.finalizePaidBooking` atomically converts those seats, issues one signed ticket, and changes `pending` to `paid`. It is an internal settlement primitive shared by debug confirmation and future trusted verifiers; QR generation never calls it.

Release and expiry always query `heldByBookingId` plus `status: held`. They never release by seat code alone. Consequently, expiring booking A cannot make a seat owned by booking B available, and booked/paid seats never match a release query.

### Relevant ShowSeat indexes

- `{ showId: 1, seatCode: 1 }` unique: identity and atomic seat lookup.
- `{ showId: 1, status: 1 }`: one-show availability and occupancy queries.
- `{ heldByBookingId: 1 }`: ownership-scoped release/payment checks.
- `{ holdExpiresAt: 1 }`: stale hold cleanup.
- `{ bookedByUserId: 1 }`: user booking/seat analysis.
- `{ showTime: 1 }`: bounded time-range occupancy analytics.
- Shows also index branch/time, movie/time, and theater/time for browsing and overlap checks.

## Strict race mode

`STRICT_RACE_CANCEL_BOTH=true` enables the requested unusual near-simultaneous policy. Each checkout records a short-lived attempt, waits `RACE_WINDOW_MS`, and checks overlapping seats for another request in the same race window. Competing attempts are marked conflicted before normal locking.

If an earlier attempt has already created a holding/pending booking, the strict-race compensator cancels only that unpaid booking and releases only its owned held seats. A conflicting request receives HTTP 409 with `RACE_CONFLICT`. Paid bookings are never cancelled or released. Atomic seat ownership remains the primary protection even when strict mode is disabled.

## Expiration

The API worker runs every `BOOKING_CLEANUP_INTERVAL_MS` and finds bounded batches of expired holding/pending bookings. Each state change and ownership-scoped release executes transactionally. Seat and booking endpoints also apply defensive expiration so a delayed worker does not leave stale availability.

The browser countdown is display-only. Server dates are authoritative.

## Show management

Show creation validates movie, branch, theater membership, future times, booking window, integer THB prices, and theater overlap. `THEATER_CLEANUP_MINUTES` adds a cleanup buffer around active scheduled/open shows. Seat-state generation uses one `insertMany` call inside the show transaction.

After active or paid bookings exist, the API rejects changes to a show's movie, branch, theater, time, or price. Cancelling a show retains all history, cancels/releases unpaid bookings, and keeps paid bookings/tickets for operational follow-up. Refund processing is outside this demo.

## PromptPay payment and ticket QR

`GET /api/bookings/:id/payment-qr` authenticates the caller, checks booking ownership, expiry and held-seat ownership, and generates a PromptPay EMV payload with `promptpay-qr` from the persisted THB total. `qrcode` renders a black-on-white SVG with a four-module quiet zone, returned as an image data URL. The response includes amount, currency, booking ID, status and the original expiry; it is private/no-store. Repeated requests never create another booking or extend its hold. Submitted amounts are ignored.

Set `PAYMENT_QR_TARGET` only in backend `.env` or deployment secrets. It accepts a Thai mobile number, a 13-digit citizen/tax ID, or a 15-digit PromptPay wallet ID; spaces and hyphens are normalized. Placeholder/missing/invalid values produce `PAYMENT_CONFIGURATION_ERROR` (503). Format validation cannot establish that a recipient is registered with a bank. No raw recipient field or payload is saved or returned separately. Legacy demo fields are excluded from model queries; deployments with historical demo data should purge their old `payment.target` and `payment.qrPayload` fields under their data-retention process.

There is no bank API, gateway webhook, or verified-slip service. Generating, displaying or scanning a QR does not mark the booking paid. Status stays `pending` until trusted settlement, cancellation/expiry, or an explicitly enabled development simulation. Do not operate this as an unattended production payment system yet.

For development only, set `ENABLE_DEBUG_PAYMENT=true` and `VITE_ENABLE_DEBUG_PAYMENT=true` in ignored `.env`, then restart API and Vite. Both flags default to disabled in `.env.example`. `POST /api/bookings/:id/debug-confirm-payment` returns 404 unless the backend flag is true AND `NODE_ENV` is not `production`. Only the authenticated owner may confirm a pending, unexpired booking; even administrators cannot confirm another user's booking. Request body amounts/status/seats are ignored. The internal finalizer checks stored amounts and exact seat ownership, and uses a transaction to prevent partial or duplicate settlement. No fake bank transaction IDs are recorded.

The checkout button requires both frontend opt-in and the backend's non-sensitive capability flag. Vite includes it only in the development server, never in build/preview output (even when local `.env` sets `NODE_ENV=development`). It is labelled **Debug: Mark as Paid** with a simulation warning, retains the PromptPay QR until confirmation, and then uses the normal ticket success UI. This action is not evidence of a PromptPay transfer.

TODO: integrate authenticated, idempotent payment verification with recipient/amount checks, transaction reference reconciliation, atomic seat/ticket issuance, and late/duplicate payment handling. PromptPay payloads contain routing information and an amount, but no enforceable booking expiry or unique booking reference. Hiding an expired QR cannot revoke a screenshot already saved by a customer or prevent a late bank transfer. Checkout removes the QR at the hold deadline and the existing expiry service releases seats; a future verifier must handle late transfers safely.

Ticket QR content is a signed token containing opaque identifiers, not user credentials. MongoDB stores its SHA-256 hash. The admin-only verify endpoint validates the signature, hash, ticket state, and optional consume transition.

QR codes are returned by protected API endpoints as data URLs, so private payment/ticket files are not exposed through public directory listing. `qrdata/` remains available for a future file-backed provider.

## Admin and analytics

The responsive admin console includes:

- POS dashboard with revenue today/range, tickets, paid/active counts, occupancy, revenue/ticket series, status distribution, movie and branch performance.
- Top movies, branches, theaters, showtimes, and highest-occupancy shows from bounded MongoDB aggregations.
- Movie CRUD, secure poster upload, activation, and safe archive.
- Branch and theater creation/edit/enable/disable with data-driven seat layouts.
- Show creation/status/cancellation and Normal/Premium pricing.
- Scheduled banner CRUD and secure image upload.
- Paginated/filterable booking operations and admin ticket verification.

Analytics accept at most a 366-day range and run in MongoDB; React never downloads the full booking collection.

## Media

Public media is stored below `migdata/`, never as MongoDB binary data:

```text
migdata/logos/
migdata/banners/
migdata/movies/<movieId>/
migdata/shows/<showId>/
```

Uploads accept only JPEG, PNG, and WebP MIME types, are limited by `MAX_UPLOAD_MB`, receive a server-generated UUID filename and server-selected extension, and are constrained to the resolved media root. Client filenames and destinations are not trusted. Nginx and Express serve individual files without directory listing.

Media documents retain owner/reference metadata. Disabling or archiving catalog content does not blindly remove files, preventing accidental deletion of referenced or historical media.

## Development

Requirements: Docker Desktop/Engine with Compose v2.

```bash
cp .env.example .env
```

Replace `JWT_SECRET` with a random value. Then start all services:

```bash
docker compose up --build
```

Compose starts MongoDB with `--replSet rs0`, waits for it, automatically runs idempotent `rs.initiate()`, waits for a primary, then starts the API and Vite. No manual Mongo shell command or container-side install is required.

- Web: `http://localhost:5173`
- API health: `http://localhost:3000/api/health`
- MongoDB: `localhost:27017` in development only

Seed the demo after the stack is healthy:

```bash
docker compose exec api npm run seed
```

The seed is explicit and safe to run repeatedly. It creates/upserts five branches, five 300-seat theaters per branch (25 total), sample movies/banners/current shows, show-seat records only for those sample shows, and the configured admin.

Local commands are also available when a compatible Mongo replica set is already running:

```bash
npm run dev
npm run seed
npm test
npm run lint
npm run build
```

## Production

Create `.env` from the example and provide a strong unique `JWT_SECRET`. Configure a registered PromptPay target and integrate trusted payment verification before accepting production payments. Run the standalone production Compose file:

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

The production web image builds Vite and serves it from Nginx on `http://localhost:8080` by default. Nginx supplies SPA fallback for direct refreshes, proxies `/api` and `/media`, and MongoDB has no published host port. The API image prunes development dependencies and runs as the non-root `node` user. Named volumes persist MongoDB, public media, and reserved QR data.

Use TLS at the external reverse proxy in a real deployment because production auth cookies are Secure.

## Environment variables

| Variable | Default / purpose |
|---|---|
| `NODE_ENV` | `development`; production enables secure cookies and hides stack traces |
| `WEB_PORT` | development `5173`, production example `8080` |
| `API_PORT` | `3000` |
| `MONGO_PORT` | development host Mongo port, `27017` |
| `MONGO_URI` | database URI including `replicaSet=rs0` |
| `CORS_ORIGIN` | comma-separated credentialed browser origins |
| `JWT_SECRET` | required in production, at least 32 characters |
| `JWT_EXPIRES_IN` | `7d` |
| `BOOKING_HOLD_MINUTES` | `5` |
| `BOOKING_CLEANUP_INTERVAL_MS` | `10000` |
| `STRICT_RACE_CANCEL_BOTH` | `true` |
| `RACE_WINDOW_MS` | `300` |
| `PAYMENT_QR_TARGET` | server-only registered PromptPay target; placeholders disable QR generation |
| `ENABLE_DEBUG_PAYMENT` | backend opt-in for debug settlement; always blocked in production |
| `VITE_ENABLE_DEBUG_PAYMENT` | non-sensitive development UI opt-in; excluded from build/preview output |
| `MAX_UPLOAD_MB` | `5` |
| `MIGDATA_ROOT` | `migdata` |
| `QRDATA_ROOT` | `qrdata` |
| `SEED_ADMIN_USERNAME` | `admin` |
| `SEED_ADMIN_PASSWORD` | `change-me`; change before seeding shared environments |
| `THEATER_CLEANUP_MINUTES` | `15` |

When no development JWT secret is supplied, the API creates an in-memory random secret for that process. Existing sessions end on restart. Production refuses to boot without an explicit secret.

## Testing

```bash
npm test
npm run lint
npm run build
docker compose config
docker compose -f docker-compose.prod.yml config
```

The integration suite creates an isolated MongoDB replica set and covers:

- registration, normalized duplicate prevention, login, bad credentials;
- protected and admin-only routes;
- multi-seat holds and transaction rollback;
- manipulated client price ignored in favor of show pricing;
- expiry and booking ownership release safety;
- PromptPay EMV/CRC validation, authoritative amounts, repeated QR requests, unchanged expiry, and blocked unverified payment confirmation;
- cross-user booking/payment/cancel privacy;
- concurrent same-seat checkout with at most one owner;
- strict-race cancel-both behavior with no remaining lock.

## API conventions

Success:

```json
{ "success": true, "data": {} }
```

Error:

```json
{ "success": false, "code": "SEAT_CONFLICT", "message": "..." }
```

Expected status codes include 201 for creation, 400 for invalid input, 401/403 for authentication/authorization, 404 for inaccessible ownership-scoped records, and 409 for state conflicts. Raw MongoDB errors and production stack traces are not returned.

### Scoped API request IDs

Authentication and request IDs are separate layers. JWT/session cookies identify the user; ownership checks and admin roles decide authorization. A request ID adds a narrowly scoped, temporary permission to invoke an operation. Possessing an ID never grants login or an admin role. Cloudflare Access remains an outer layer; these rules also apply to internal requests that bypass Cloudflare.

`server/src/services/ApiRequestStore.js` is the only request-ID store. It keeps cryptographically random UUIDs in two JavaScript Maps, indexed by `(userId, resourceType, resourceId, scope)`. Records include `createdAt` and an absolute `expiresAt` exactly 30 minutes later. Repeated bootstrap requests reuse a still-valid ID without refreshing its deadline. Every protected request checks expiry. A one-minute timer removes expired records and their index entries and uses `.unref()`.

There are no request-ID MongoDB collections or Redis dependencies. Process/container restarts and redeployment lose all IDs. This implementation assumes one API process; horizontally scaled deployments need a deliberate shared-store design before scaling.

The operation allowlist in `shared/apiAccessPolicy.js` drives the central server gate and the frontend helper. [The complete endpoint audit](docs/api-access-audit.md) lists public endpoints, authenticated reads, mutations, admin operations, and intentional exemptions. Health checks and public card/branch summaries remain public. Login, registration, and logout are authentication controls, so they do not depend on an access ID. Movie and seat detail pages require login.

#### Bootstrap and protected requests

For profile, seats, bookings, payment/tickets, and admin operations, first call `POST /api/request-access` with normal authentication and JSON `{ "method": "GET", "path": "/bookings/BOOKING_ID" }`. For booking creation, also supply `context: { showId }`; for ticket verification/consumption, supply `context: { consume: false/true }`. The server matches an explicit operation policy, determines the user from the verified session, checks resource existence/ownership/admin role, and returns metadata only:

```json
{
  "success": true,
  "userId": "USER_ID",
  "apiRequestId": "SECURE_UUID",
  "expiresIn": 1800,
  "expiresAt": "2026-10-17T13:30:00.000Z"
}
```

Send `X-API-User-ID: USER_ID` and `X-API-Request-ID: SECURE_UUID` on the actual operation, together with the normal session cookie or bearer JWT. URLs for these operations are retained, but calls omitting the access headers are rejected before the controller, upload middleware, or transaction runs. The user, resource type/ID, scope, current ownership, and current admin role are validated. Collection IDs permit only the named collection operation; pagination/filter changes do not grant additional authority. Ticket `verify` and `consume` use different scopes. Booking `create` is bound to the requested show.

Movies retain their existing explicit flow: authenticated `POST /api/movies/:movieId/request-access`, then `GET /api/movies/:movieId/:userId/:apiRequestId`. The bootstrap returns no movie data. Bare `GET /api/movies/:movieId` and `/api/movies/:movieId/shows` stay unregistered (404). General tokens and movie tokens share the same RAM service and cleanup.

Authentication failures return the usual `UNAUTHORIZED` code; role/ownership failures retain the application's 403/404 behavior. Token errors use `API_REQUEST_ID_INVALID` or `API_REQUEST_ID_EXPIRED` (401), or `API_REQUEST_ID_MISMATCH` (403). A supplied user identity differing from the session returns `API_REQUEST_USER_MISMATCH` (403). Bootstrap/detail responses use `Cache-Control: private, no-store` (movie detail may use `no-store`). Full request IDs are omitted from error logs.

#### Browser cache and retry behavior

All `api`, `apiGet`, `apiPost`, `apiPatch`, `apiDelete`, and `apiResponse` calls pass through `src/api/requestAccess.js`. The existing movie helper delegates to this same layer. Pages receive the same `data` payloads as before. Cookies, custom headers, JSON bodies, query strings, and multipart uploads are preserved.

The helper caches metadata in sessionStorage under `api-request:<userId>:<resourceType>:<resourceId>:<scope>`, checks the expiry before reuse, and falls back to RAM when storage is blocked. Valid cache entries survive page refreshes. The auth context supplies the existing user ID; cold-start profile bootstrap uses the verified session's ID returned in metadata. Logout clears these temporary entries. Concurrent bootstraps and identical GETs share an in-flight operation; distinct mutations are never collapsed.

On a stable request-ID rejection code, the helper clears the rejected entry, obtains a new scoped ID, and retries the protected operation **at most once**. This recovers from server restarts without manually refreshing. It does not retry ordinary authentication failures, ownership/role errors, booking/payment conflicts, or network errors. A failed replacement is propagated; there is no loop.

Request IDs and idempotency keys remain independent. An access ID answers whether the authenticated user can invoke this resource operation. The existing booking `idempotencyKey` identifies a mutation already processed. The helper preserves the same idempotency key and body across an authorized retry; booking transactions, seat locks, expiry, and race protections remain authoritative.

#### End-to-end example

With an existing authenticated cookie jar and a booking owned by that user:

```bash
# 1. Bootstrap a booking-read ID (no booking details in this response).
curl -b cookies.txt -X POST https://HOST/api/request-access \
  -H 'Content-Type: application/json' \
  -d '{"method":"GET","path":"/bookings/BOOKING_ID"}'

# 2. Substitute userId and apiRequestId from the response; reuse until its original expiry.
curl -b cookies.txt https://HOST/api/bookings/BOOKING_ID \
  -H 'X-API-User-ID: USER_ID' \
  -H 'X-API-Request-ID: SECURE_UUID'
```

An ID bootstrapped for this read cannot cancel the booking, generate its payment QR, read another booking, or call an admin API. Each of those operations needs its own authorized scope.

## Troubleshooting

- **API waits for MongoDB:** inspect `docker compose logs mongodb mongo-init api`. The initializer is designed to be safely rerun after an existing replica set starts.
- **Transactions report replica-set errors:** confirm the URI contains `replicaSet=rs0` and use the Compose MongoDB service rather than a standalone `mongod`.
- **No movies on the homepage:** run the explicit seed, or create a movie and a future open show in Admin. An empty database intentionally displays usable empty states.
- **Secure cookie is not sent in production over HTTP:** terminate TLS before Nginx or run the site through an HTTPS reverse proxy.
- **Upload rejected:** use a real JPEG/PNG/WebP below `MAX_UPLOAD_MB`; changing only a filename extension is not sufficient.
- **Port already in use:** override `WEB_PORT`, `API_PORT`, or development `MONGO_PORT` in `.env`.

## Known limitations

- PromptPay QR generation and optional development-only simulated settlement are implemented; real payment verification still requires trusted bank/webhook/slip reconciliation. There is no refund engine, SMS, email, or OTP.
- The Docker database is a single-node replica set intended for development/demo durability, not multi-node high availability.
- Strict-race detection is MongoDB-based and bounded to one database cluster; no Redis/distributed cross-cluster coordination is implemented.
- Seat availability uses periodic refresh and checkout-time validation rather than WebSockets.
- QR ticket scanning accepts a pasted/scanned token; direct hardware camera integration is not included.
- Media uses a local persistent volume, not object storage/CDN. The metadata and service boundaries allow a future provider.
- Paid bookings on cancelled shows are retained for audit; automatic financial refunds are outside the demo.

Replacement markers, placeholder locations, and exact final source lines are documented in `inimage.txt`.
