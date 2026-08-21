# State

Updated: 2026-08-21

## Done in this build block

- Empty public repository initialised as a Vinext/React PWA.
- Product-specific employee sign-in, first-PIN replacement and work-area choice.
- Event Work tabs: Home, Updates, Malur, Taj and core-only Budget.
- Responsive Event activity list and assignment-aware activity detail flow.
- D1 schema and migration for 10 tables: People, Sections, Jobs, assignments, state, updates, Budget, sessions, sync batches and audit events.
- Protected authentication, session, PIN change, snapshot, job update, reassignment, Budget and Master import endpoints.
- Master contract for the exact `1 People`, `2 Sections` and `3 Jobs` headers.
- Install manifest, offline route, service worker and explicit update prompt.
- Guest Coordination tabs: Mine, Invitations, Guests, Travel and Stays.
- Unified Guest Master validation for Guest Categories, Guest Groups, Guests, Group Agenda, Travel Plans, Travel Stops and Hotels.
- Guest database structure for categories, groups, event-specific invitations/RSVP, dated agenda, category travel, individual stays, templates and message batches/results.
- Explicit English, German or Japanese preference per guest and 24 fixed draft templates covering four message purposes and two channels.
- Core-committee template review/approval, recipient-specific message preflight and actionable `Not sent` reasons.
- Guest add/edit/archive endpoints, coordinator-owned agenda editing, category travel editing and name-search hotel/room assignment.
- Public event-specific RSVP route with only `Yes, I’ll attend` and `Unable to attend` responses.

## Evidence so far

- Real Master workbook structural check: 22 of 22 People, 13 of 13 Sections and 140 of 140 source Jobs were accepted. `Both` expansion produced 202 operational jobs; 0 validation issues or unresolved references.
- Automated build and test run: 10 of 10 passed, 0 failed.
- TypeScript compile and ESLint: both passed with 0 errors.
- Browser interaction checks: 5 of 5 Event Work tabs opened; the tested activity save changed Home progress and appeared in Updates.
- Responsive browser checks: login and Event Work had 0 horizontal-overflow failures at 320×568 and 360×800; login also had 0 vertical-overflow failures at both phone sizes. Desktop 1440×900 had 0 horizontal-overflow failures.
- Browser console check after the completed phone workflow: 0 errors and 0 warnings.
- Dependency audit: 0 vulnerabilities across 6 production dependencies. The complete development-tool audit reports 4 moderate transitive findings under `drizzle-kit`; npm offers no non-breaking fix.
- Complete automated run after Guest integration: 16 of 16 tests passed, 0 failed; the production build completed.
- ESLint after Guest integration: 0 errors and 0 warnings.
- Guest browser checks: 5 of 5 tabs opened at 360px and 320px. Horizontal-overflow failures were 0 of 5 at each width after the Mine correction.
- At 320px, visible controls below 44px were 0 in each of the 5 Guest tabs.
- Browser workflows reproduced: guest language selection/save, filtered invitation audience count, agenda-line save, category-travel save, guest-name hotel/room save, 6 invitation template variants and a send preflight with 1 ready and 1 not-sent recipient.
- Browser console after the completed Guest phone workflow: 0 errors and 0 warnings.

## Not complete

- Production database/account provisioning and secret configuration.
- Writing permanent hidden record IDs back to the human Master Sheet.
- Google Sheets Apps Script/service-account connection.
- A fully atomic Master import across every D1 chunk; the present import is validated first and idempotent/retryable, but large writes are split into batches.
- The real Guest source workbook has not yet been converted into the new seven-sheet Guest Master contract; real-data Guest acceptance is unproven.
- External WhatsApp and email provider selection, credentials and delivery worker. The current product stops at an honest preflight and does not claim to send.
- RSVP token creation is reserved for the future provider-backed send operation; RSVP storage and response handling exist.
- Core committee review and approval of final English, German and Japanese wording.
- Production load testing against the provisioned D1 account.
- Public/custom-domain deployment, load testing and pilot acceptance. An owner-only phone-review preview is authorised separately.
