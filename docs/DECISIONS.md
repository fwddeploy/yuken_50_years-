# Decisions carried into this repository

- The product is a single-event internal PWA for the YIL Golden Jubilee, not a reusable event platform.
- Google Sheets is the eventual live human-editable master; Excel is the controlled initial import, export and backup format.
- The unified Master uses connected sheets for People, Sections, Jobs, Guest Categories, Guest Groups, Guests, Group Agenda, Travel Plans, Travel Stops and Hotels.
- The operational database is authoritative for authentication, sessions, progress, updates, Budget, sync state and audit history.
- Core committee members can manage all Event Work. Other employees can read all work and edit only currently assigned work.
- Only core committee members can assign or reassign work and access Budget in the application.
- The frontend is not an authorisation boundary. Every protected read and write is checked by the server.
- Guest contact data and real workbook rows do not belong in the public repository.
- Every workbook supplied during development is a test fixture only. Row counts, names, category totals and missing-field patterns must never drive product decisions, UI structure or capacity limits.
- Guest operational RSVP, message attempts/results, live activity and audit history stay in the database rather than the workbook.
- Each guest has one explicit preferred language: English, German or Japanese. Language is never inferred from nationality or origin.
- Guest messages use centrally approved, fixed templates selected automatically by message purpose, channel and guest language. Coordinators do not edit message wording.
- Guest travel is assigned by category only. Multiple categories may share a route or vehicle; individual guest travel overrides are out of scope.
- Hotel and room are assigned to an individual guest by name. More than one guest may share a room number.
- A group has one primary and one secondary coordinator. Both can manage and message that group.
- An owner-only preview deployment is authorised for phone review. Public access, a custom domain and provider credentials remain separate approvals.
- A Master replacement must be previewed and explicitly confirmed before it can apply. The preview identifies active workflows that will be archived and operational history that will be retained.
- D1 owns structured photo/video metadata; a private Cloudflare R2 bucket owns the bytes. Attachments are available only through an authenticated application route and are never stored in Excel, Google Sheets, Git or public browser storage.
- Each Event update accepts at most three JPG, PNG, WebP, HEIC, MP4, MOV or WebM files; photos are limited to 10 MB each and all attached media to 50 MB per update.
- Event activities remain Master-owned and cannot be created ad hoc in the application. Budget, progress, updates, attachments, agenda edits, stay assignments, app-created guests and app-created travel plans are operational D1 data.
- A Master-managed guest can be edited in the application but can only be removed through the Master replacement workflow. An app-created guest can be archived in the application. Both paths retain operational history and audit records.

Cloudflare Sites, Workers and D1 are the hosting path. DigitalOcean is not introduced without measured need; the domain and import contracts remain independent of the UI.
