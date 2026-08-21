# PWA performance and app-feel acceptance checklist

Give this document to the next agent before asking for deployment or production sign-off.

## Problem reported by the owner

When the app opens, the Yuken Golden Jubilee picture can take an unacceptably long time to appear. The user sees loading or buffering instead of an immediate, polished app screen. This must be reproduced and fixed as a startup-performance problem, not dismissed as a cosmetic issue.

The current source image, `public/golden-jubilee-cover.jpg`, is only **55,573 bytes**. Therefore, do not assume that image compression alone is the answer. Measure whether the delay comes from server time-to-first-byte, JavaScript/RSC startup, request scheduling, image optimisation, caching, the service worker, authentication, or the network.

## Product expectation

The installed PWA must feel like a native event-operations app:

- the branded shell appears immediately;
- the artwork never leaves a large blank rectangle;
- no avoidable spinner or “buffering” screen appears;
- controls react immediately after a tap;
- navigation keeps the header and bottom tabs stable;
- content uses skeletons or reserved space instead of jumping;
- poor connectivity is explained clearly without pretending stale operational data is current;
- new releases update predictably without an unexplained refresh loop.

## Rule: reproduce before changing code

Test both the deployed URL and a production build. Record separate results for:

1. first visit with no service worker or HTTP cache;
2. second visit with a warm cache;
3. installed PWA reopened from the home-screen icon;
4. Slow 4G with 4× CPU slowdown;
5. normal Indian 4G/5G on a physical Android phone;
6. Safari and installed PWA on a physical iPhone;
7. offline reopen after one successful online visit;
8. one installed old release followed by one new release.

For every run, record the device, browser, connection, cache state, release ID, video or screenshots, waterfall, console errors and the exact measured values. Do not say “fast” or “slow” without measurements.

## Inspect these requests first

Use the browser Network and Performance panels. Check, in order:

1. `/` — status, redirects, time to first byte and full response time.
2. render-blocking CSS and JavaScript/RSC chunks — size, cache headers and long tasks.
3. `/golden-jubilee-cover.jpg` or the actual final image URL — request start time, priority, status, content type, transfer size, cache source and decode time.
4. `/api/auth/me` — verify that a slow authentication check does not block the login artwork or basic shell.
5. `/sw.js` — installation, activation, update checks and controller changes.
6. `/manifest.webmanifest`, icons and fonts — failures must not delay first paint.
7. Event and Guest snapshot requests after sign-in — the persistent shell must remain visible while data loads.

Check whether the browser requests an image-optimisation URL instead of the static JPEG. If an optimisation layer delays the first branded paint on Cloudflare, compare it with a direct static image request before choosing a fix.

## Known source detail that must be reviewed

At commit `2935fb8`, the service worker precaches the offline page, manifest, favicon and PWA icons. It does **not** precache `/golden-jubilee-cover.jpg`, and its runtime static-asset rule does not include that image. This is a concrete review point, not yet proof that it is the only cause.

Review these files:

- `app/EventOperationsApp.tsx` — login artwork rendering and priority.
- `app/globals.css` — reserved artwork dimensions, placeholder background and responsive login layout.
- `app/layout.tsx` — metadata and any safe image-preload decision.
- `src/pwa/service-worker.ts` — precache and runtime cache policy.
- `app/sw.js/route.ts` — release-specific service-worker response.
- `app/PwaRegistration.tsx` — update checks and reload behaviour.
- `vite.config.ts` and Cloudflare configuration — asset delivery and cache headers.

## Required implementation outcomes

Choose changes from evidence, but the final implementation must achieve all of the following:

- reserve the artwork’s final space before it downloads, with no layout shift;
- display a branded navy/blue fallback or lightweight placeholder immediately;
- request the above-the-fold artwork at high priority and avoid lazy loading it;
- prevent authentication or database requests from blocking the static login shell;
- serve the artwork directly and efficiently with the correct `image/jpeg` content type;
- use long-lived caching with safe release-based cache invalidation;
- make the installed PWA able to show its static branded shell after a successful installation, even when the network is unavailable;
- keep `/api/**`, RSVP state, messages, audit data and other private operational data out of public caches;
- show a deliberate loading skeleton inside Event or Guest content while live data is loading, without removing the header or navigation;
- remove unnecessary sequential startup requests and avoid duplicate image, manifest or service-worker requests;
- avoid a service-worker `controllerchange` reload loop;
- ensure a new release replaces old static assets only after the user accepts the refresh prompt;
- retain native phone keyboard behaviour for employee number, PIN, phone, email, date and time inputs.

Possible evidence-driven fixes include a fingerprinted artwork filename, an explicit preload, direct static `<img>` delivery with `fetchpriority="high"`, a tiny inline placeholder, and versioned service-worker precaching. Do not apply all of these blindly; demonstrate which change improves the measured trace.

## Acceptance thresholds

Use the 75th percentile of at least five runs per tested condition unless a physical-device limitation is documented.

| Measurement | Required result |
|---|---:|
| Branded background or placeholder visible | within 300 ms of first paint |
| Login artwork visible on warm installed-PWA reopen | within 700 ms |
| Login artwork visible on a reasonable cold 4G visit | within 1.5 s |
| Largest Contentful Paint on mobile | ≤ 2.5 s |
| Cumulative Layout Shift | ≤ 0.10 |
| Interaction to Next Paint | ≤ 200 ms |
| Tap feedback for buttons/tabs | begins within 100 ms |
| App-shell navigation after first load | no full blank-page transition |
| Horizontal overflow at 320/360/414 px | 0 affected screens |
| Unhandled console errors in the tested journeys | 0 |
| Failed required static assets | 0 |
| Repeated downloads of unchanged artwork during one session | 0 |
| Service-worker refresh loops across two releases | 0 |

If the hosting platform makes a threshold impossible, provide the trace proving the external limit and propose the smallest hosting or architecture change. Do not silently weaken the threshold.

## Screen-by-screen app-feel checks

Check all of these at 320, 360 and 414 CSS pixels:

- Login: artwork, employee number, PIN, Show, Forgot PIN and Sign in remain on one screen where device height permits; native keyboard opens; no delayed blank artwork.
- First PIN change and work-area chooser: instant tap feedback, no double submission, no layout jumping.
- Event Home: header and bottom navigation remain stable; section rows open without a page flash.
- Updates: filters respond immediately and updates use skeletons during a refresh.
- Malur and Taj: Programme, Jobs and Preparation segments switch without refetching the entire application shell.
- Budget: add sheet opens and closes smoothly; keyboard does not cover the save action.
- Guest Mine: group chips and Agenda/Travel segments switch immediately; message preview does not reflow unpredictably.
- Invites, Guests, Travel and Stays: search/filter typing remains responsive with realistic data volumes.
- Every bottom tab, back action, modal/sheet open-close action, confirmation and refresh prompt.

## Data-volume and concurrency checks

Do not test only with the small dummy workbook. Seed realistic test data without using real guest details:

- at least 2,000 guests;
- at least 250 Event jobs;
- at least 50 guest groups/categories combined;
- realistic agendas, routes, hotels, rooms, updates and message histories;
- 100 concurrent authenticated sessions for read-heavy operations;
- controlled concurrent writes to different records and to the same record.

Measure API latency separately from visual responsiveness. List p50, p75, p95 and failure counts for each tested endpoint. Verify that large lists remain searchable and do not freeze the main thread.

## Release evidence required before sign-off

Return all of the following:

1. a before-and-after Network waterfall for cold and warm startup;
2. a before-and-after mobile Performance trace;
3. the exact artwork request URL, transfer size, cache source and timing;
4. Lighthouse or equivalent mobile results, treated as supporting evidence rather than the only test;
5. physical Android and iPhone screen recordings;
6. a 320/360/414 screen matrix with measured overflow and failures;
7. results of the two-release PWA update test;
8. results of the offline branded-shell test;
9. automated build, lint and test denominators;
10. the remaining unproven items and the precise reason each remains unproven.

Do not declare the product “picture-perfect,” “production-ready,” or “app-like” until these checks have been reproduced. Deployment requires separate owner approval.

## Prompt to use with this checklist

> Read `CLAUDE.md`, `docs/UI-SOURCE-OF-TRUTH.md` and this performance checklist before acting. Reproduce the slow Yuken login-artwork load on the deployed PWA and a production build. Show the measured cold and warm startup waterfalls, identify the actual bottleneck, and propose the smallest fix that preserves the approved v52/v64/v66 UI. Then implement only the approved fix and repeat every acceptance test in this document. Do not deploy without my approval, and do not claim success without measured before-and-after evidence.
