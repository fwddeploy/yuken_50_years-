# YIL Golden Jubilee — continuation handoff

Updated: 2026-08-21

## Read this first

This is a single-event internal coordination PWA for Yuken India Limited's 50-year Golden Jubilee. It is not a reusable event platform and it is not a guest-facing application. About 40 internal coordinators are expected, with a capacity target of 100 concurrent sessions.

Do not rebuild from the historical HTML prototypes. The tracked Vinext/React/Cloudflare application is the authoritative implementation. `DECISIONS.md` explains why, `CONTRACT.md` defines required behaviour, and `STATE.md` separates reproduced evidence from unproven work.

## Live and source locations

- Live PWA: `https://yil-golden-jubilee-ops.tech-sinisters.chatgpt.site/`
- Human-editable test Master: `https://docs.google.com/spreadsheets/d/1CgnFt9wqh7Gsa8iu15npyXe42SgPkDrqxyiArRc5xgQ/edit`
- GitHub: `https://github.com/fwddeploy/yuken_50_years-.git`
- Cloudflare Sites project ID: `appgprj_6a87f20d2f9c81919927bc602960d9f0`
- Runtime bindings: D1 `DB`, private R2 `MEDIA`
- The production runtime was last published from source commit `8ce3bd474fd7200be7ac2ef6068e2b430a9af1af`; later commits may contain documentation-only handoff improvements.

The ZIP contains a baseline unified test workbook for offline inspection. The live Google Sheet may be newer. Never replace the live Sheet from the ZIP without a fresh preview and explicit owner confirmation.

## Product surfaces

### Authentication and roles

- People originate in `1 People` with a permanent ID, employee number, initials, responsibility and core/non-core flag.
- New people receive the protected `INITIAL_LOGIN_PIN`, then must choose a private four-digit PIN.
- Sessions are HttpOnly and only token hashes are stored.
- Core can edit/reassign all Event work, access Budget, approve templates and run Master sync.
- Non-core can read all Event work but edit only assigned activities. Mine contains only groups where the employee is primary or secondary coordinator.

### Event Work

- Home, Updates, Malur, Taj and core-only Budget.
- A Master job with `Both` becomes separate Malur and Taj operational jobs.
- Progress, blocking notes, updates and audit remain in D1 across Master replacement.
- Update media uses D1 metadata plus private R2 bytes through an authenticated range-capable endpoint.

### Guest Coordination

- Mine, Invitations, Guests, Travel and Stays.
- Guests have one explicit language: English, German or Japanese.
- Invitations and RSVP are event-specific for Malur on 15 November 2026 and Taj on 18 November 2026.
- Group agenda is dated; one primary and one secondary coordinator may manage a group.
- Travel is assigned by guest category, never by individual override.
- Hotel and room are assigned to an individual guest found by name.
- Coordinators choose WhatsApp or Email and `Send to all`; they never type or alter template wording while sending.

## Data ownership

```text
Excel / Google Sheets
  People, Sections, Jobs, categories, groups, guests,
  agenda, travel definitions and hotels
              │
              │ validate → preview exact version → confirm
              ▼
Cloudflare D1
  authentication, sessions, progress, updates, Budget,
  RSVP, stays, messages, outbox, sync batches and audit
              │
              ├── private R2: photo/video bytes
              ├── Apps Script: durable app ↔ Sheet synchronisation
              └── Acele / Gmail SMTP: external message delivery
```

Google Sheets is the human-editable Master. D1 is authoritative for live operational state and history. Workbook replacement must never overwrite PINs, sessions, progress, Budget, RSVP, stays, message attempts/results, attachments or audit history.

## Master workbook contract

The one workbook has these connected tabs:

1. `1 People`
2. `2 Sections`
3. `3 Jobs`
4. `4 Guest Categories`
5. `5 Guest Groups`
6. `6 Guests`
7. `7 Group Agenda`
8. `8 Travel Plans`
9. `9 Travel Stops`
10. `10 Hotels`

Every row receives a permanent record ID. Human editors must not change that column. Removing a row means setting its `Remove this …?` field to `Yes`; a physically missing Master row is also reported as an impact. Invalid references produce `Needs fixing` and apply nothing.

Core sync workflow in the PWA:

1. Guest Coordination → account initials → **Sync Master Sheet**.
2. **Check Master Sheet changes** exports and validates the full workbook.
3. Review every record leaving active workflows.
4. **Apply this Sheet version** signs and applies only that exact version.

App guest/agenda/travel writes commit to D1 and a coalescing `sheet_sync_outbox` in one batch. Apps Script uses a lock, permanent IDs and row-hash conflict detection. The connector source and setup are under `integrations/google-sheets/`.

## Messaging

- 24 fixed defaults cover four purposes × two channels × three languages.
- Only core may approve wording.
- Preflight freezes recipients and rendered variables, and reports each missing contact, variable or approval.
- Invitations generate independent RSVP links for each guest/event/channel; only token hashes are stored.
- Test mode is allowlist-only. Production WhatsApp uses an exact approved Acele workflow for each purpose/language.
- Provider acceptance is not represented as delivery/read. Ambiguous responses become `delivery-unknown` and are not blindly retried.

Never include provider credentials in this ZIP. Ask the owner to configure the runtime values named in `.env.example` directly in Sites.

## Hosting and deployment

This is a Vinext application packaged for Cloudflare Sites. Preserve `.openai/hosting.json`, D1 migrations and the private R2 binding.

Typical local verification:

```bash
npm ci
npm test
npm run lint
npx tsc --noEmit
npm audit --omit=dev --audit-level=high
```

Publishing requires the Sites project, a fresh source write credential, an exact pushed commit, a packaged build, a saved version and an approved production deployment. Updating source files in Git does not update the live PWA by itself.

## Current measured state

- Latest complete automated gate: 33 of 33 tests passed; production build and ESLint passed; the production dependency audit reported 0 vulnerabilities.
- Fresh app-to-Sheet lifecycle: 19 of 19 checks passed.
- Fresh Sheet-to-app lifecycle: 14 of 14 checks passed.
- Staged production load: 1,000 of 1,000 operations passed up to 100 authenticated sessions; latency measurements and limitations are in `STATE.md`.
- Public root and service worker returned HTTP 200; unauthenticated Event, Guest and Budget APIs returned HTTP 401 in 3 of 3 checks.
- Current Google Sheet connector finished with 0 pending and 0 failed writes at the final recorded check.

These are exact measured denominators, not a blanket production-readiness percentage.

## Intentionally unproven or still requiring owner action

- Real production dataset accuracy; every current workbook is a test fixture.
- Final core approval of all English/German/Japanese wording and the final Meta-approved WhatsApp workflow mapping.
- Physical iPhone/Android camera, native keyboard, photo picker and real video codec acceptance.
- Production approval of the shared initial-PIN model and edge login throttling/uniform failure responses.
- Custom domain and final pilot acceptance.

## Handoff security boundary

This archive must not contain:

- `.env` files or runtime secret values
- employee PINs or session tokens
- Google Sheet shared sync secret
- WhatsApp/Acele credentials
- email passwords or Gmail app passwords
- credential markdown files
- private R2 objects or a database dump containing contact data

The owner must supply required private values through protected deployment settings, never by committing them.

## Best continuation order

1. Verify the ZIP manifest and run the local gate.
2. Read the four documentation files before proposing architecture changes.
3. Inspect the live PWA and Google Sheet without mutating them.
4. Ask the owner which incomplete acceptance item to address.
5. For any live data change, preview the exact impact and obtain explicit confirmation before applying it.
