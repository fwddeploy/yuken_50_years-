# State

Updated: 2026-08-21

## Done in this build block

- Empty public repository initialised as a Vinext/React PWA.
- Product-specific employee sign-in, first-PIN replacement and work-area choice.
- Event Work tabs: Home, Updates, Malur, Taj and core-only Budget.
- Responsive Event activity list and assignment-aware activity detail flow.
- D1 schema and migrations for 24 tables covering identity, Event Work, Budget, sessions, sync/audit, Guest Coordination, messaging and attachment metadata.
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
- App-managed Budget creation and Travel-plan creation, Master-managed guest removal guard, app-guest archive and work-area switching from both app headers.

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

## Not complete

- Writing permanent hidden record IDs back to the human Master Sheet.
- Google Sheets Apps Script/service-account connection.
- Real-data acceptance remains unproven by definition; every supplied workbook is treated only as a test fixture and the real production dataset has not been imported.
- External WhatsApp and email provider selection, credentials and delivery worker. The current product stops at an honest preflight and does not claim to send.
- RSVP token creation is reserved for the future provider-backed send operation; RSVP storage and response handling exist.
- Core committee review and approval of final English, German and Japanese wording.
- Production load testing against the provisioned D1 account.
- Physical iPhone/Android acceptance of the native keyboard, photo picker, camera capture and real video codec playback. Browser input contracts and synthetic R2 range behavior are proven; the physical device behavior is unproven.
- Public/custom-domain deployment, load testing and pilot acceptance. An owner-only phone-review preview is authorised separately.
- Two-way Google Sheets write-back or a generated Excel export for app-created/edited rows. Today app writes are immediately authoritative in D1 and auditable, but they do not rewrite a local `.xlsx` file.
- Public employee login approval. The shared first-time PIN must be replaced with unique claim codes or all claims completed behind a private access gate; login throttling also needs an edge policy and uniform failure responses.
