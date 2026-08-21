# UI source of truth

Read this before changing any screen.

## Approved references

The product frontend is an implementation of these approved prototypes, not a new dashboard design:

1. Login: `YIL Golden Jubilee - Screen 1 Build v52/index.html`
2. Event Work and Mine/Days decisions: `YIL Golden Jubilee - Mine and Days v64/index.html`
3. Guest Mine and Travel: `YIL Golden Jubilee - Guest Mine and Travel v66/index.html`

Copies of all three references are included in the handoff ZIP under `reference-prototypes/`.

## Non-negotiable rule

Preserve the reference screen structure, navigation, information hierarchy, labels, card patterns and tap journeys. Production engineering must sit behind that UI. Do not replace a reference list with a dashboard, remove the Agenda/Travel segments, expand every activity on Home, or invent a different navigation model.

## Allowed design work

- spacing and typography consistency
- colour and contrast refinement within the YIL navy, blue and gold identity
- touch targets, native mobile inputs and safe-area support
- narrow-phone responsiveness and reduced horizontal overflow
- loading, empty, warning, validation, permission and offline states
- accessible labels, focus states and keyboard behaviour
- production data, permissions, audit, media, Google Sheets and messaging wiring

## Current implementation

- Login retains the v52 artwork-first employee-number/PIN screen.
- Event Home retains the v64 event banner and one-row-per-planning-section structure. A section opens its activities rather than expanding the entire workbook on Home.
- Event Updates retains a people filter and groups reports by day.
- Malur and Taj retain Programme, Jobs and Preparation segments.
- Guest Mine retains one selected group, Agenda/Travel segments, editable work rows, message preview, Send and Copy actions.
- Message wording remains centrally approved; the preview is read-only while live variables come from operational data.
- Invites, Guests, Travel and Stays retain the established five-tab Guest navigation and production backend actions.

## Do not silently change later decisions

The database owns live state, RSVP, check-in/messages and audit. The Master Sheet owns workbook master data. Templates are centrally approved. Sending is to all filtered recipients after WhatsApp/email selection and preflight. Primary and secondary coordinators can manage a group. These decisions are recorded in `DECISIONS.md` and `CONTRACT.md`.

## Verification baseline

Before UI sign-off, compare the running app and the three reference files at 320, 360 and 414 CSS pixels. Exercise every bottom tab, back action, modal/sheet open-close action, search/filter, add/edit/remove flow, Agenda/Travel switch and send preflight. Record the measured denominator; never claim visual completion from the build alone.
