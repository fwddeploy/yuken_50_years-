# State

Updated: 2026-08-21

## Done in this build block

- Empty public repository initialised as a Vinext/React PWA.
- Product-specific employee sign-in, first-PIN replacement and work-area choice.
- Event Work tabs: Home, Updates, Malur, Taj and core-only Budget.
- Responsive Event activity list and assignment-aware activity detail flow.
- D1 schema and migrations for 25 tables covering identity, Event Work, Budget, sessions, sync/audit, Guest Coordination, messaging, attachment metadata and durable Google Sheets delivery.
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
- Version-bound Master impact preview and explicit confirmation before any import can apply.
- Master/app provenance is preserved when editing existing guests, agenda lines, travel plans and travel stops; app-created guest rows remain protected from Master replacement.
- Unified 11-sheet test Master generated outside Git with dynamic row handling and explicit missing-data warnings.
- Parent-bound agenda-line and travel-stop mutations prevent client-supplied child IDs from moving records across guest groups or travel plans.
- Protected Event-update media: bounded phone file chooser, server MIME/signature validation, private R2 storage, D1 metadata, authenticated no-store reads and byte-range playback.
- App-managed Budget creation and Travel-plan creation, confirmed guest archive with Google Sheets write-back, and work-area switching from both app headers.
- Phone/browser Back and Forward history across work-area, Event tabs and Guest tabs; narrow-screen agenda/travel remove controls now meet the 44px target.
- Master apply responses now report the archive impact from the exact confirmed preview, including rows omitted from a replacement workbook.
- Google Sheets integration source: permanent-ID app-to-Sheet upserts, a coalescing D1 outbox with bounded retry, Apps Script locking, Sheet-to-app impact preview and exact-version apply confirmation.
- Release-specific service-worker generation and update checks on registration, focus, reconnection and visibility changes.
- A tracked, production-target-guarded staged load harness for 10, 25, 40, 75 and 100 authenticated sessions.

## Evidence so far

- Supplied test workbook structural check: 22 of 22 People, 13 of 13 Sections and 140 of 140 source Jobs were accepted. `Both` expansion produced 202 operational jobs; 0 validation issues or unresolved references. These figures are test evidence, not product limits.
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
- Unified test Master verification: 11 sheets, 1,845 of 1,845 supplied test guest rows, 0 schema issues and 0 formula-error matches. Warnings were explicit for 130 missing finish-by dates, 74 missing emails, 252 missing mobile numbers and empty agenda/travel input.
- Synthetic local D1 system workflow: 10 of 10 HTTP checks passed across Master add, login, Event reflection, progress save, Guest reflection, app add/edit, removal impact preview, Master replacement and app archive.
- Latest isolated historical-preservation readback after archive: active jobs 0, active guests 0; 4 invitation rows, 1 stay row, 2 job-state rows, 1 job update, 9 audit rows and 2 applied sync batches remained.
- Unified test Master local import: preview completed in 910 ms; one atomic apply completed in 3,759 ms and read back 22 active people, 13 sections, 202 operational jobs, 1,845 guests and 3,690 invitation rows.
- Local 40-client realistic-fixture run: login 40 of 40 succeeded (p95 10,845 ms), Event snapshot 40 of 40 succeeded (p95 5,627 ms) and Guest snapshot 40 of 40 succeeded (p95 10,214 ms). This is single-process local evidence, not production D1 capacity evidence.
- Single local snapshot size: Event 71,692 raw bytes / 8,866 gzip bytes; Guest 1,067,498 raw bytes / 123,330 gzip bytes.
- Latest release verification: production build passed, ESLint passed, 16 of 16 automated tests passed and the production dependency audit found 0 vulnerabilities across 6 production dependencies.
- Security scan of 74 repository files reported 2 launch risks in the approved PIN model: one high shared-bootstrap-PIN risk and one medium account-enumeration/lockout risk. The owner-only preview contains both during private testing; public launch does not.
- Security diff review covered 10 of 10 changed runtime files and reproduced 1 medium cross-group agenda-ID authorization defect. Before the fix, the crafted request returned 200 and moved the other group's item; after the fix it returned 409, while a legitimate same-group update and a new line both returned 200. The sibling travel-stop test produced the same 409/200 protected/legitimate result.
- Latest phone audit measured 32 screen/viewport combinations across 320×568 and 360×800: 0 horizontal-overflow failures, 0 controls below 44px, 0 login vertical-overflow failures and 0 browser console errors/warnings. Numeric, decimal, phone, email, date/time and media inputs were focusable with the intended input modes.
- Latest synthetic local D1/R2 lifecycle passed 18 of 18 HTTP checks: Master add/reflection/removal, login, forged upload rejection, protected full/range media readback, invalid-range rejection, Budget validation, app/Master guest rules, Travel add/conflict, history retention and app-row protection.
- Latest working-tree security diff scan reviewed 21 of 21 authoritative runtime/configuration files and produced 0 reportable findings. TAC status was unverified because the advisory connector was not connected; the parent agent performed all 21 reviews because delegated workers were unavailable for this scan.
- Latest release run completed the production build and passed 21 of 21 automated tests; the production dependency audit still reports 0 vulnerabilities.
- Private Cloudflare-backed Sites version 4 deployed successfully. Its live D1 read-back exposes all 24 expected application tables, including attachment metadata.
- Remote unified test Master import first reproduced one Cloudflare PBKDF2 limit failure at 210,000 iterations. After changing the portable setting to Cloudflare's 100,000-iteration ceiling and rerunning the test/build, the second preview and apply succeeded: 2,106 applied, 0 rejected, 0 warnings and 0 archived. The live `sync_batches` row independently reads `applied` with the same 2,106/0 counts.
- The 2,106 remote test-Master records comprise 22 people, 13 sections, 202 operational jobs, 11 guest categories, 9 guest groups, 1,845 guests and 4 hotels. The remote attachment table is empty as expected before a user uploads media.
- Exhaustive phone interaction pass initially produced 189 passes from 190 measured checks and reproduced one real failure: browser Back left the PWA instead of moving through app screens. After the history fix, the six exact Back/Forward paths across Event and Guest work areas passed 6 of 6; the corrected 320px agenda and travel remove targets measured 44×48 and 44×46 respectively.
- Live private D1/R2 acceptance passed 49 of 49 checks across authentication/PIN replacement, Event snapshots and updates, forged-media rejection, private full/range photo reads, Budget, Guest create/edit/archive, templates and channel preflight, Stay, Agenda, Travel, sign-out and later login.
- Live replacement-Master removal/restore passed 10 of 10 checks: the preview reported one impacted Guest, confirmed apply removed it from active Guest workflows, restoration returned it, and the final preview reported 0 remaining archive impacts.
- Final regression completed the production build and passed 22 of 22 automated tests; ESLint reported 0 errors and 0 warnings, the production dependency audit reported 0 vulnerabilities, and `git diff --check` passed.
- Final security diff review closed all 4 changed runtime source files with 0 candidates and 0 reportable findings. TAC status remained unverified because its advisory connector was not connected; all four inventory files were reviewed by the parent agent.
- Private production staged load completed 1,000 of 1,000 HTTP operations with 0 failures: 250 logins, 500 authenticated Event/Guest snapshot reads and 250 logouts across 10/25/40/75/100-session stages. At 100 sessions, login p95 was 4,399 ms, the two snapshot-wave p95s were 7,154 ms and 7,015 ms, and logout p95 was 4,435 ms. This is capacity evidence for the current test fixture, not real-data accuracy evidence; the measured snapshot latency remains an optimisation target.
- Release-readiness build completed and all 25 of 25 automated tests passed; ESLint and `git diff --check` passed with 0 errors.
- A blind independent baseline audit reproduced 0 of 1 Google connectors, 0 of 1 update prompts with byte-identical service workers and no safe tracked production load harness. The subsequent implementation directly addresses all three reproduced gaps; live Google delivery remains unproven until real connector credentials are supplied.
- Private Sites release 6 installed the byte-distinct `yil-event-shell-aea173091a4c` worker over the previous fixed `v2` worker. The browser displayed 1 of 1 update prompts; selecting Refresh update produced 1 of 1 controlled reloads, removed the old cache and left 0 waiting workers.
- Private Sites release 7 then produced a second byte-distinct worker, `yil-event-shell-bc13e14cee94`. It reached `installed/waiting` in 1 of 1 checks, showed the update banner, and the user-facing refresh promoted it in 1 of 1 checks; the old release-6 cache was removed and 0 waiting workers remained.
- Independent re-audit passed the PWA transition and staged-load harness, then reproduced three Sheets edge cases plus one standalone TypeScript configuration failure. The follow-up closes them with row-hash conflict detection, post-apply Sheet baselines, automatic permanent IDs for human-created rows, background delivery/retry during app writes and active Guest reads, partial-batch acknowledgement, and an explicit no-emit TypeScript configuration. Final re-verification passed 25 of 25 tests, ESLint, standalone TypeScript and `git diff --check`.
- The verified 11-sheet test Master is now a native Google Sheet in the customer-owned Google account, and its deployed Apps Script `/exec` connector directly returned 22 people, 140 source jobs, 1,845 guests, 11 categories and 9 groups with HTTP 200.
- The first production Sheet preview reproduced HTTP 502 with `The operation was aborted`: the real 1,845-guest export took longer than the previous 8-second client timeout. Release 9 raised only that bounded connector timeout to 30 seconds; the production build, 25 of 25 tests, ESLint and standalone TypeScript all passed before deployment.
- Post-fix live two-way Sheet acceptance passed 19 of 19 checks. Exact-version pull/apply baselined 2,106 records with 0 archives; a disposable app guest was then created, updated and archived, all three states were independently read back from Google Sheets, the archived guest left active app workflows, and final outbox status was 0 pending / 0 failed.
- Provider-backed message delivery is implemented behind an explicit Send confirmation and bounded batches. Recipient contacts and rendered variables are frozen at preflight, each send is atomically claimed, RSVP links are created only at invitation send time, only token hashes are stored, test sends are server-allowlisted, and ambiguous provider responses are retained as `delivery-unknown` without blind retry.
- Release-candidate verification after the delivery implementation completed the production build and passed 28 of 28 automated tests. ESLint, standalone TypeScript, `git diff --check`, and the production dependency audit all passed; the audit found 0 known vulnerabilities across 6 production dependencies.

## Not complete

- Real-data acceptance remains unproven by definition; every supplied workbook is treated only as a test fixture and the real production dataset has not been imported.
- Live deployed email provider acceptance and inbox readback remain unproven until the release is deployed and exercised only against the authorised test-recipient allowlist.
- Live WhatsApp provider acceptance remains unproven until either an authorised test number opens a current 24-hour service window or the final templates and Acele workflows are approved and mapped.
- Core committee review and approval of final English, German and Japanese wording.
- Physical iPhone/Android acceptance of the native keyboard, photo picker, camera capture and real video codec playback. Browser input contracts and synthetic R2 range behavior are proven; the physical device behavior is unproven.
- Public/custom-domain deployment, load testing and pilot acceptance. An owner-only phone-review preview is authorised separately.
- Public employee login approval. The shared first-time PIN must be replaced with unique claim codes or all claims completed behind a private access gate; login throttling also needs an edge policy and uniform failure responses.
