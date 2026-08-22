# UI design direction — proposal, not yet built

This answers the actual question from the last session: not just "what's inconsistent" but **which version do we standardize on, and why**. Nothing in this document has been applied to the app yet — see the companion mockup artifact for what it would look like before anything real changes.

## 1. "Screen fitting" — the two things being conflated

Two separate problems were both called "spacing," and they need different fixes:

- **Gutter** — how close content sits to the physical edge of the phone. This is the one that reads as "fitting totally to the screen." Right now the main content area (`.eventBody`) sits **14px** from the screen edge on phones. For comparison, the Login screen (already fixed) floats with a visible card, border, shadow, and margin — it reads as a considered surface, not a form stretched to fill the glass. The rest of the app never got that treatment; it's still edge-to-edge HTML with a small padding number.
- **Rhythm** — how much air sits *between* elements once they're inside that gutter (hero height, gap between rows, etc.). Last session's fixes mostly worked this axis — shrinking heroes that were too tall. That's correct and should stay; it's not what's being complained about now.

**Proposal for gutter**: increase the phone-width side margin from 14px to **20px**, and — more importantly — stop treating `.eventBody` as bare content and start treating it as a **panel**: a very subtle background-color step-down from the page background, with the top corners rounded where it meets the header (mirroring how bottom sheets already round their top corners against the shade behind them). This is the same visual idea as the Login card, applied to the main content instead of introducing a new layout — it doesn't touch navigation, doesn't turn the list into a dashboard, and stays inside what `docs/UI-SOURCE-OF-TRUTH.md` allows ("spacing and typography consistency," "narrow-phone responsiveness").

## 2. Which consistency to standardize on (the direct answer to "which one do we follow")

For each pattern that currently has multiple versions, here's the one to keep and why — not the average of the existing values, a deliberate choice:

| Pattern | Keep this value | Why this one, not the others |
|---|---|---|
| List row height | **60px** | Between the Home row (56px, slightly tight for the 44px touch floor plus real breathing room) and the Guest-row/Updates heights (76–88px, too heavy for a name + one line of subtext). 60px gives ~16px of clearance above the 44px floor either side, which reads as comfortable rather than cramped, for the stated 60+ audience. |
| Row shadow | **`0 5px 14px rgba(8,35,59,.035)`** (the majority recipe) | It's already used in 6 of 7 places; the Home row's slightly different Round-4 shadow is the outlier, not the standard. |
| Row/card radius | **14px** | Matches the row height and the section-card radius already in use almost everywhere; keep 16px only for `.travelCard` since it's a genuinely different, denser content type, not a plain row. |
| Row padding | **12px 16px**, always symmetric | The asymmetric paddings (`.jobMain`'s `10px 2px 10px 13px`) exist only to make room for trailing controls (O/C chips) — solve that with a dedicated trailing-slot width in the row grid, not by shrinking one side's padding to zero. |
| Eyebrow label | **11px, uppercase, `letter-spacing:.14em`, gold-300 on dark / navy-900 on light** | This is the one context (`.prototypeSectionTitle .eyebrow`) that already has a complete definition; every other eyebrow should inherit it instead of redefining color alone. |

## 3. Filters and controls — a full inventory, and what to actually do about it

You asked "how many more filters are there" — here's every one, found by reading the components, not guessing:

**Pattern A — Dropdown chip** (`FilterPicker` component, already shared): Day, Person (Updates) · Category, Language (Guest directory) · Reply status, Category (Invitations) · Showing (Invitations) · Your group (Mine). **8 instances, 1 component.** This is already correctly unified — don't touch the pattern itself, only its padding/height (already tightened last session).

**Pattern B — Two-option segmented toggle** (`.eventSwitch`): the Malur/Taj switch on Invitations, Guest directory, Travel, and the equivalent inline one on the Event Work Malur/Taj screen · Agenda/Travel on Mine. **Visually one pattern, but implemented twice** — `EventSwitch` is a real shared component inside `GuestCoordinationApp.tsx`, while the Event Work side (`app/EventOperationsApp.tsx`) hand-duplicates the same markup inline instead of importing it. Not a visual bug today because both copies currently match, but it's the reason a future style change would need to be made twice and could silently drift apart. Worth sharing properly when this round of work touches either file.

**Pattern C — Three-option segmented toggle** (`.venueSegments`): Programme/Jobs/Preparation only. One instance — no drift risk, but should visually match Pattern B's sizing since a coordinator reads them as "the same kind of control," just with a third button.

**Pattern D — Horizontal scrolling row**: the "All days / 15 Nov / 18 Nov / + Add date" bar on Mine. This is correctly a different pattern from A/B/C because the list is open-ended (a coordinator can add more dates) — a dropdown would hide them, a segmented toggle assumes a fixed count. Keep it distinct.

**Pattern E — Checkbox group**: guest-category selection in the Travel plan editor. One instance, correctly a checkbox group since more than one category can apply.

**Pattern F — Choice-row buttons**: Bus/Car mode in the Travel plan editor. Same visual family as Pattern B (segmented toggle) but a separate CSS class (`.choiceRow`/`.modeChoice`) with its own sizing. Should share Pattern B's dimensions since it's functionally the same "pick one of a few" control.

**The actual recommendation**: don't collapse these into one universal filter component — B (fixed 2–3 choices, always visible) and A (open-ended list, saves space) solve genuinely different problems, and forcing "Malur/Taj" into a dropdown would hide information a coordinator needs to see at a glance. What needs to change is that B, C, and F currently have three different sizes for what a user perceives as "the same kind of toggle" — unify their height/padding, not their existence.

## 4. What "effortless" means here, concretely

Not a vague design word — three specific, checkable things:

1. **One tap always does one thing.** (Already fixed last session — the agenda-row delete button that could be mis-tapped.) Carry that same standard forward: nothing in this pass should add a second small hit-target next to a primary one.
2. **The active state is always visible without needing color alone.** The navy/gold active-state color is fine and should stay (per §"what's already consistent" in the prior audit) — but for someone in bright sunlight or with lower color vision, a selected filter/toggle should also read as selected by weight or a filled background shape, not hue alone. Worth a contrast check once the row/toggle sizing pass lands, not a separate task.
3. **Nothing important is one accidental scroll away.** The row-height reduction in §2 directly increases how many activities/guests are visible without scrolling per screen — that's the concrete version of "effortless" for a coordinator working a checklist during the event.

## Next step

The companion artifact shows the Home screen rebuilt against this proposal — real data, real copy, new spacing/panel treatment — so you can react to something concrete instead of a spec. If it lands, the same token values get applied everywhere the audit in `docs/UI-CONSISTENCY-AUDIT.md` flagged, screen by screen, the same way Login and Home were done.
