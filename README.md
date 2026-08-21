# YIL Golden Jubilee — Event Operations

Internal, installable web application for coordinating Yuken India Limited's Golden Jubilee.

## Current production slice

- Employee-number and PIN authentication with first-login PIN replacement
- Work-area selection
- Event Home, Updates, Malur, Taj and core-only Budget
- Master Sheet validation and protected import boundary
- Assignment-based server permissions and core-only reassignment
- Persistent event state and audit schema for Cloudflare D1
- PWA manifest, safe offline state and user-controlled update refresh

- Guest Coordination with Mine, Invitations, Guests, Travel and Stays
- Explicit English, German and Japanese message-template preflight
- Impact-previewed, confirmation-bound unified Master import

Provider-backed WhatsApp/email delivery is intentionally not claimed until credentials, approved wording and delivery workers are connected.

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

## Master Sheet boundary

The application consumes a validated JSON representation of the unified People, Sections, Jobs, Guest Categories, Guest Groups, Guests, Group Agenda, Travel Plans, Travel Stops and Hotels sheets. Every supplied workbook is treated as test data and remains outside the repository. A preview/confirmation handshake is required before applying an import. Google Sheets will call the same contract when live two-way sync is connected.

See `docs/CONTRACT.md`, `docs/DECISIONS.md` and `docs/STATE.md` before changing data ownership or permissions.

## Verification

```bash
npm test
```

This compiles the production worker and runs rendered-output, Master contract, permission, security, PWA-boundary and repository-data tests.
