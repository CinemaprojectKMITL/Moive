# API access audit

All routes in app.js and server/src/routes were inspected, including nested adminCatalogRoutes. The route-inventory regression test rejects unclassified router endpoints. The shared allowlist is enforced centrally before data controllers, validation/upload middleware, and mutations. Public endpoints and auth controls retain their own behavior.

## A: Intentionally public endpoints and controls

| Method and path | Reason |
| --- | --- |
| GET /api/health | Docker/reverse proxy/monitoring health; no access bootstrap |
| GET /api/home | Landing-page cards, banners, branch summaries |
| GET /api/movies | Movie-card summary fields only |
| GET /api/branches | Public branch directory |
| GET /api/branches/:id | Public branch/showtime information, movie summaries only |
| GET /api/branches/:id/shows | Alias for public branch/showtime information |
| POST /api/auth/register | Establishes authentication; existing validation and rate limit |
| POST /api/auth/login | Establishes authentication; existing validation and rate limit |
| POST /api/auth/logout | Clears the session cookie even when a session/access ID has expired |
| GET/HEAD /media/* | Public posters/banner image files; no private payment or ticket QR files |
| OPTIONS /api/* | Existing CORS preflight handling; returns no application data |

Login/register/logout are control exceptions rather than application data APIs. Requiring an access ID before establishing authentication or clearing an expired session would create a circular dependency. There are no other exempt authenticated data or mutation APIs.

## Authenticated bootstrap control endpoints

| Method and path | Authorization |
| --- | --- |
| POST /api/request-access | JWT/cookie; explicit operation allowlist; current user, existence, ownership and admin role as applicable; metadata only |
| POST /api/movies/:id/request-access | JWT/cookie; active, unarchived movie; metadata only |

## Protected endpoint inventory

B = authenticated data; C = state-changing operation; D = admin data or mutation. All require normal authentication plus scoped access. Existing controllers continue checking ownership, validation, status, feature flags and business rules. D additionally requires the current admin role both at bootstrap and execution. Read-method payment QR generation is classed as a mutation because it marks a booking pending.

| Category | Method and path | Type:scope | Resource binding |
| --- | --- | --- | --- |
| B | GET /api/movies/:id/:userId/:apiRequestId | movie:read | URL movie ID; authenticated user must match URL user |
| B | GET /api/auth/me | profile:read | self |
| B | GET /api/shows/:id/seats | seat:read | URL resource ID |
| C | POST /api/bookings | booking:create | body/context showId |
| B | GET /api/bookings/me | booking:list | self |
| B | GET /api/bookings/:id | booking:read | URL resource ID |
| C | POST /api/bookings/:id/cancel | booking:cancel | URL resource ID |
| C | GET /api/bookings/:id/payment-qr | payment:generate-qr | URL resource ID |
| B | GET /api/bookings/:id/ticket-qr | ticket:read | URL resource ID |
| C | POST /api/bookings/:id/debug-confirm-payment | payment:debug-confirm | URL resource ID |
| D | GET /api/admin/analytics | admin-analytics:read | collection |
| D | POST /api/admin/tickets/verify | admin-ticket:verify | collection |
| D | GET /api/admin/movies | admin-movies:list | collection |
| D | POST /api/admin/movies | admin-movies:create | collection |
| D | PATCH /api/admin/movies/:id | admin-movies:update | URL resource ID |
| D | GET /api/admin/branches | admin-branches:list | collection |
| D | POST /api/admin/branches | admin-branches:create | collection |
| D | PATCH /api/admin/branches/:id | admin-branches:update | URL resource ID |
| D | GET /api/admin/theaters | admin-theaters:list | collection |
| D | POST /api/admin/theaters | admin-theaters:create | collection |
| D | PATCH /api/admin/theaters/:id | admin-theaters:update | URL resource ID |
| D | GET /api/admin/shows | admin-shows:list | collection |
| D | POST /api/admin/shows | admin-shows:create | collection |
| D | PATCH /api/admin/shows/:id | admin-shows:update | URL resource ID |
| D | GET /api/admin/banners | admin-banners:list | collection |
| D | POST /api/admin/banners | admin-banners:create | collection |
| D | PATCH /api/admin/banners/:id | admin-banners:update | URL resource ID |
| D | DELETE /api/admin/movies/:id | admin-movies:archive | URL resource ID |
| D | POST /api/admin/movies/:id/poster | admin-movies:upload | URL resource ID |
| D | DELETE /api/admin/banners/:id | admin-banners:disable | URL resource ID |
| D | POST /api/admin/banners/:id/image | admin-banners:upload | URL resource ID |
| D | GET /api/admin/bookings | admin-bookings:list | collection |

Ticket verification additionally resolves consume=true to the separate admin-ticket:consume scope. Verification/consumption is a collection operation for the admin scanner, whose signed ticket verification remains authoritative. Profile/list self scopes are resolved to the authenticated user's actual ID by the server. IDs never grant access to another type, resource or scope.

## Bypasses and aliases

- GET /api/movies/:id and GET /api/movies/:id/shows remain absent, including for logged-in clients.
- All migrated profile, seat, booking, payment, ticket and admin URLs reject legacy calls that omit scoped headers, including case/trailing-slash variants and HEAD requests. Their route strings are retained for REST mutations/uploads; this is not an unprotected compatibility fallback.
- Unknown operations in the admin and booking namespaces fail closed. Generic bootstrap cannot issue an unrestricted token or bootstrap an unlisted endpoint.
- Public summaries are deliberately still accessible; they do not include full movie description/original-title/detail records.
- Admin list/mutation APIs are not public movie-detail alternatives: current authentication, admin role, resource/scope ID, and the original controller are all required.
- No new payment-confirmation production shortcut, user-profile mutation, or unimplemented /orders or /payments API was added.

## Frontend caller audit

The only browser fetch is in src/api/transport.js, called by src/api/requestAccess.js. src/api/client.js routes every existing API helper through the scope policy, so page callers use protected requests without duplicating access state. src/api/movies.js delegates its URL-based flow to the same layer. AuthContext provides/clears the authenticated identity, and App requires login for movies and seats.

Affected caller files, migrated through the shared client:

- src/contexts/AuthContext.jsx (profile and authentication state)
- src/pages/MovieDetailsPage.jsx (movie helper)
- src/pages/SeatSelectionPage.jsx (seat reads, booking creation)
- src/pages/CheckoutPage.jsx (booking, cancellation, payment QR, debug payment, ticket QR)
- src/pages/MyBookingsPage.jsx (own bookings, ticket QR)
- src/pages/admin/AdminDashboardPage.jsx (analytics)
- src/pages/admin/AdminMoviesPage.jsx (list/create/update/archive/poster upload)
- src/pages/admin/AdminBranchesPage.jsx (list/create/update)
- src/pages/admin/AdminTheatersPage.jsx (list/create/update)
- src/pages/admin/AdminShowsPage.jsx (list/create/update/cancel)
- src/pages/admin/AdminBannersPage.jsx (list/create/update/disable/image upload)
- src/pages/admin/AdminBookingsPage.jsx (booking list, ticket verify/consume)

HomePage, BranchesPage and BranchDetailsPage use the intentionally public summary endpoints. Components contain no direct protected network calls. server/tests/liveQa.js now bootstraps scoped calls as well; Docker health URLs are unchanged.

## Changed files

- `README.md`
- `server/src/app.js`
- `server/src/controllers/publicController.js`
- `server/src/middleware/errorHandler.js`
- `server/src/services/ApiRequestStore.js`
- `server/tests/apiRequestStore.test.js`
- `server/tests/cinema.test.js`
- `server/tests/frontendMovieApi.test.js`
- `server/tests/liveQa.js`
- `src/App.jsx`
- `src/api/client.js`
- `src/api/movies.js`
- `src/contexts/AuthContext.jsx`
- `docs/api-access-audit.md`
- `server/src/middleware/apiRequestAccess.js`
- `server/src/services/ApiAccessService.js`
- `server/tests/apiSurface.test.js`
- `server/tests/frontendRequestAccess.test.js`
- `server/tests/helpers/scopedRequest.js`
- `shared/apiAccessPolicy.js`
- `src/api/requestAccess.js`
- `src/api/transport.js`
