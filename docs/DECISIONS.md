# Decisions carried into this repository

- The product is a single-event internal PWA for the YIL Golden Jubilee, not a reusable event platform.
- Google Sheets is the eventual live human-editable master; Excel is the controlled initial import, export and backup format.
- The unified Master uses connected sheets for People, Sections, Jobs, Guest Categories, Guest Groups, Guests, Group Agenda, Travel Plans, Travel Stops and Hotels.
- The operational database is authoritative for authentication, sessions, progress, updates, Budget, sync state and audit history.
- Core committee members can manage all Event Work. Other employees can read all work and edit only currently assigned work.
- Only core committee members can assign or reassign work and access Budget in the application.
- The frontend is not an authorisation boundary. Every protected read and write is checked by the server.
- Guest contact data and real workbook rows do not belong in the public repository.
- Guest operational RSVP, message attempts/results, live activity and audit history stay in the database rather than the workbook.
- Each guest has one explicit preferred language: English, German or Japanese. Language is never inferred from nationality or origin.
- Guest messages use centrally approved, fixed templates selected automatically by message purpose, channel and guest language. Coordinators do not edit message wording.
- Guest travel is assigned by category only. Multiple categories may share a route or vehicle; individual guest travel overrides are out of scope.
- Hotel and room are assigned to an individual guest by name. More than one guest may share a room number.
- A group has one primary and one secondary coordinator. Both can manage and message that group.
- An owner-only preview deployment is authorised for phone review. Public access, a custom domain and provider credentials remain separate approvals.

Cloudflare Sites, Workers and D1 are the hosting path. DigitalOcean is not introduced without measured need; the domain and import contracts remain independent of the UI.
