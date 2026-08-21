# Claude continuation rules

Before changing this project, read these files completely in this order:

1. `docs/HANDOFF.md`
2. `docs/DECISIONS.md`
3. `docs/CONTRACT.md`
4. `docs/STATE.md`

The recorded decisions are authoritative. If a decision looks wrong, explain the conflict and ask before replacing it.

- Treat every supplied workbook and current database row as test data, never as a product limit or UI requirement.
- Never place guest contact data, passwords, app passwords, provider keys, sync secrets, session secrets or live environment values in Git, logs, screenshots or generated handoff files.
- Do not claim a workflow works without reproducing it. State the number of checks passed and the denominator.
- Preserve the Google Sheet preview/confirmation gate, permanent IDs, D1 audit/history ownership, assignment permissions, private R2 media and message-delivery allowlist.
- A non-core employee may read all Event work, edit only assigned work, manage only assigned guest groups, and may not access Budget, work assignment or Master sync.
- Use the current `main` branch. Do not restart from the historical HTML prototypes.
