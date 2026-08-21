# YIL Golden Jubilee — Event Operations

Internal, installable web application for coordinating Yuken India Limited's Golden Jubilee.

## Current production slice

- Employee-number and PIN authentication with first-login PIN replacement
- Work-area selection
- Event Home, Updates, Malur, Taj and core-only Budget
- Master Sheet validation and protected import boundary
- Assignment-based server permissions and core-only reassignment
- Persistent event state and audit schema for Cloudflare D1
- Authenticated photo/video updates using D1 metadata and private Cloudflare R2 objects
- PWA manifest, safe offline state and user-controlled update refresh

- Guest Coordination with Mine, Invitations, Guests, Travel and Stays
- Explicit English, German and Japanese message-template preflight
- Impact-previewed, confirmation-bound unified Master import

Provider-backed WhatsApp/email delivery, fixed-template approval, recipient preflight, RSVP links and delivery-state audit are implemented. Test delivery remains fail-closed to the protected allowlists; production WhatsApp requires the final Meta-approved workflow mapping.

## Local development

```bash
npm ci
npm run dev
```

The development build provides a clearly labelled local Event Work preview. Production authentication never accepts the preview identity.

## Runtime configuration

Copy the variable names from `.env.example` into the deployment's protected secret configuration. Never commit their values.

- `INITIAL_LOGIN_PIN`: configured temporary four-digit PIN used only when a new employee account is created from the Master.
- `SESSION_PEPPER`: long random secret used when hashing stored session tokens.
- `MASTER_IMPORT_KEY`: long random secret required by the Master import endpoint.

The deployment also requires a D1 binding named `DB` and a private R2 binding named `MEDIA`. Media is never served from a public bucket URL; active employee sessions read it through `/api/job-attachments/:id`.

## Master Sheet boundary

The application consumes a validated JSON representation of the unified People, Sections, Jobs, Guest Categories, Guest Groups, Guests, Group Agenda, Travel Plans, Travel Stops and Hotels sheets. Every supplied workbook is treated as test data and remains outside the repository. A preview/confirmation handshake is required before applying an import. Google Sheets will call the same contract when live two-way sync is connected.

Start with `docs/HANDOFF.md`, then read `docs/CONTRACT.md`, `docs/DECISIONS.md` and `docs/STATE.md` before changing data ownership or permissions.

## Verification

```bash
npm test
```

This compiles the production worker and runs rendered-output, Master contract, permission, security, PWA-boundary and repository-data tests.
