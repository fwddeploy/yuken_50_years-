# YIL Golden Jubilee internal coordination contract

## Scope

This build covers the internal coordinator journey from employee sign-in into Event Work or Guest Coordination. It remains a single-event internal PWA.

## Journey

1. An active person from `1 People` signs in with employee number and PIN.
2. A first-time account must replace the configured temporary PIN with a private four-digit PIN.
3. The employee chooses Event Work.
4. Event Work exposes Home, Updates, Malur and Taj. Budget is shown only to core-committee members.
5. Everybody may read active work. Core committee members may edit and reassign all work. Other employees may edit only currently assigned work.
6. Guest Coordination exposes Mine, Invitations, Guests, Travel and Stays.
7. Mine shows only groups for which the employee is primary or secondary coordinator, defaulting to the selected day.
8. Invitations are separate for Malur on 15 November 2026 and Taj on 18 November 2026. Each event receives an independent RSVP.
9. Guests may respond only `Yes, I'll attend` or `Unable to attend`, followed by a thank-you state.

## Master and operational ownership

- `1 People` owns employee identity, initials, responsibility, employee number, core status and active/removal state.
- `2 Sections` owns Event Home headings and order.
- `3 Jobs` owns job wording, section, assigned people, event location, finish-by date, notes and active/removal state.
- A Master job whose location is `Both` becomes two operational jobs: Malur and Taj. Each has independent progress and updates.
- The operational database owns PIN hashes, sessions, organised/complete state, blocking notes, updates, Budget, sync history and audit history.
- Workbook files and personal data are never committed to Git.
- The Master owns guest identity, company, one category, group, origin/country, preferred language, contact channels, event inclusion, group agenda, category travel plans, ordered travel stops and hotel definitions.
- The operational database owns guest RSVP, invitation tokens, message batches/results, guest removal history, stay assignments, live edits and audit history.
- One guest record may be included in both events without duplicating their identity or contact details.

## Side effects

- Master sync validates the complete payload and produces an impact preview before applying it. Invalid references return `Needs fixing` and write nothing; a valid payload still requires confirmation for that exact Master version and current sync base.
- Valid imports are idempotent by permanent record ID and archive missing records instead of deleting history.
- App-created guest rows are identified independently from Master-managed rows and survive a Master replacement. Editing a Master-managed row does not silently convert it into an app-created row.
- Existing agenda-line IDs are bound to their guest group and existing travel-stop IDs are bound to their travel plan; a child ID can never be used to reparent another workflow's record.
- Job writes require a current authenticated session and server-side assignment check.
- Reassignment and Budget writes require core-committee status on the server.
- Each state-changing operation records an audit event.
- Every guest has one explicit preferred language: English, German or Japanese. It is not inferred from country or category.
- Approved message templates are fixed and resolved by purpose, channel and preferred language. Dynamic values come from the latest guest, agenda, travel and stay data.
- `Send to all` uses the selected event and active filters or the selected coordinated group. The coordinator chooses WhatsApp or Email; the system does not expose a recipient chooser.
- A preflight shows the recipient count. Missing contact details, missing required variables or an unapproved template skip only affected recipients and produce a `Not sent` report.
- Travel is category-based. Multiple categories may share routes and vehicles. There is no individual guest travel override.
- Hotel and room are assigned to a guest found by name. Search results include company and event so similar names can be distinguished.
- Group agendas contain dated and timed lines. Mine selects a date and sends only that date's agenda using the guest/group name.
- An Event update may include up to three validated photos/videos. R2 stores the private object bytes; D1 stores attachment ID, parent update, object key, safe filename, MIME type, size, uploader and timestamp.
- Attachment reads require an active employee session, use private no-store responses and support a single bounded byte range for phone video playback. Malformed or unsatisfiable ranges return `416`.
- A failed D1 write after an R2 upload triggers best-effort deletion of the just-uploaded objects. The update and its attachment metadata are written in one D1 batch.

## Screen-to-store map

| Screen or action | Human source | Runtime owner | Required effect |
|---|---|---|---|
| Employee sign-in / change PIN | `1 People` supplies active employee identity | D1 | Verify salted hash, create/revoke session, audit login/PIN change |
| Event Home, Malur, Taj | `2 Sections` and `3 Jobs` | Master rows in D1; live state in D1 | Master replacement updates/archives planning rows; progress/history survives archive |
| Activity update / photo / video | Employee application action | D1 metadata + private R2 bytes | Enforce assignment/core permission; update state, history and audit together |
| Budget | Core committee application action | D1 | Create validated Budget row and audit event; never write to workbook |
| Mine / group agenda | Master supplies groups/coordinators; employee edits dated lines | D1 | Show only primary/secondary groups; save dated agenda and audit mutation |
| Invitations / RSVP | Master supplies guest/event inclusion and contact data | D1 | Preflight fixed language template; store per-event RSVP and message history |
| Guest directory | Master or employee add | D1 with source marker | Master rows retire through Master import; app rows may be archived in-app |
| Travel | Master or employee add/edit by category | D1 | Validate categories, date, ordered stops and conflicts; preserve app rows on Master replacement |
| Stays | Master supplies guests/hotels; employee assigns by guest name | D1 | Store individual hotel/room assignment and audit update |
| Master upload | Controlled Excel/Google Sheets payload | D1 normalized rows + sync/audit | Validate all references, preview impact, confirm exact version, then atomically apply/archive |

## PWA behaviour

- The site is installable in standalone mode.
- API responses and authenticated HTML are never placed in the service-worker cache.
- Offline mode says that current data is unavailable; it does not present stale operations as live.
- A waiting application update is shown to the user and applied only after they select `Refresh update`.
- Guest screens use the Event Work visual system, minimum 44px controls, visible keyboard focus, plain labels, restrained filters and phone-first layouts for coordinators who may be over 60.

## Acceptance checks

- Real Master workbook: all People, Sections and Jobs validate with zero unresolved references.
- `Both` produces separate Malur and Taj jobs.
- Non-core editing fails for unassigned work and succeeds for assigned work.
- Non-core reassignment and Budget access fail server-side.
- Login throttles repeated failures, stores only salted PIN hashes and keeps session tokens in HttpOnly cookies.
- Home, Updates, Malur, Taj and Budget render at phone width without horizontal page overflow.
- Mine, Invitations, Guests, Travel and Stays render at 320px and 360px widths without horizontal page overflow.
- Guest language selects the matching approved template for both WhatsApp and Email without using nationality as a proxy.
- Each event invitation records and changes only that event's RSVP.
- Category travel updates affect guests in the category and never an individual guest override.
- Stay search distinguishes duplicate names and saves hotel/room against the selected guest.
- A message preflight reports the total audience, ready recipients and every skipped recipient with an actionable reason.
- A Master removal preview reports affected People, Sections, Event activities, Guest categories, Guest groups, Guests, Agenda lines, Travel plans, Travel stops and Hotels, plus preserved job progress, invitation, stay and message history.
- Authenticated attachment reads return the uploaded bytes; range reads return matching bytes with `206`, and invalid ranges return `416`.
