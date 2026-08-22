# UI consistency audit

Read: `app/globals.css`, `app/guest.css`, `app/touch-targets.css`, `app/EventOperationsApp.tsx`, `app/GuestCoordinationApp.tsx`, `app/layout.tsx` in full. No code changed — this is a punch list for the next session, ordered by how much of the app each item touches.

## 1. List-row height has six different values for the same visual pattern

Every screen uses a "bordered, rounded-corner, individually-shadowed row in a gap-separated list" — the pattern the owner called "sleek" on Home. But the actual row height was hand-tuned per screen instead of sharing one value:

| Screen / list | Selector | `min-height` |
|---|---|---|
| Home section detail (open a section → activities) | `.jobRow` / `.jobMain` | 56px (52px ≤760px) |
| Malur/Taj Programme | `.programmeRows>button` | 64px (62px ≤760px) |
| Budget lines | `.budgetList article` | 70px |
| Guest Mine agenda lines | `.mineLineList article` (via `.mineLineMain`) | 68px |
| Guest directory / Invitations / Stays | `.guestRow` | 76px |
| Updates | `.updateList>button` | 88px |

This is almost certainly the concrete version of "list cards here are very nicely sleek, whereas on the next screens... very broad" — the Guest directory rows (76px) and Updates rows (88px) are visibly taller/heavier than the Home activity rows (56px) they're being compared against. Updates arguably needs the extra height (it shows author + time + message + linked-activity name, four lines of content); the others don't have a content reason to differ.

**Recommendation**: pick one target height for simple two-line rows (name + subtext) — the Home 56px pattern is the one already praised — and bring `.programmeRows`, `.budgetList`, `.mineLineList`, `.guestRow` to match. Leave `.updateList` taller since it genuinely holds more content, but say so explicitly rather than let it read as another inconsistency.

## 2. Two different card shadows coexist for the same "row card" look

- Recipe A — `box-shadow:0 5px 14px rgba(8,35,59,.035)` — used by `.prototypeSectionCard`, `.programmeRows>button`, `.updateList>button`, `.budgetList article`, `.guestRow`, `.mineLineList article`/`.mineTravelList>button`. This is the majority pattern.
- Recipe B — `box-shadow:0 3px 10px rgba(8,35,59,.03)` — used only by `.jobRow`/`.jobMain` (added in the CSS file's own later "Round 4" pass, which redefined `.jobRow` again without matching Recipe A).

Both are subtle enough that this alone probably isn't visible at a glance, but it means the one screen (Home → open a section) held up as the "sleek" reference is actually running a slightly different shadow recipe than everywhere else. Worth collapsing to one recipe when the row-height pass above happens, since both will touch the same selectors.

## 3. Row/card border-radius: 3 close-but-different values

- 14px — the majority: `.jobRow`, `.prototypeSectionCard`, `.programmeRows>button`, `.updateList>button`, `.budgetList article`, `.guestRow`, `.mineLineList article`/`.mineTravelList>button`
- 16px — `.travelCard` (standalone Travel tab's route cards), and the unused `.groupCard` (see §6)
- 12px — `.templateList article` (message-template review sheet)

`.travelCard` is a genuinely different content type (multi-field route card, not a list row), so 16px vs 14px there is a reasonable, defensible difference, not an error. `.templateList article` at 12px has no such reason — it's the same "bordered content block" pattern at a slightly different radius for no evident content reason.

## 4. Padding has no shared scale — every row was hand-tuned

Horizontal row padding across the same "row" pattern: `.jobMain` → `10px 2px 10px 13px` (asymmetric — right side is 2px because the O/C chips sit there), `.programmeRows>button` → `10px 14px` (`9px 11px` ≤760px), `.guestRow` → `12px 16px`, `.budgetList article` → `12px 16px`, `.updateList>button` → `15px` all around, `.mineLineMain` → `9px 10px`. No two are identical, and there's no shared spacing token (like the `--safe-top`/`--safe-bottom` custom properties Module 3 introduced) to anchor them. This is the root cause of §1 and §3 as much as anything: without a shared row-padding/height token, every new screen re-invents its own number.

## 5. `.eyebrow` (the small label above a heading) has no base style

There is no bare `.eyebrow{}` rule anywhere in either CSS file — grep confirms it. Every screen defines its own partial override instead:

- `.eventHero>.eyebrow` (Home) — gets color + (as of the last session) `font-size`, `white-space:nowrap`, `text-overflow:ellipsis`
- `.prototypeSectionTitle .eyebrow` (section title rows) — gets color + `font-size:11px` + `letter-spacing:.18em`
- `.guestHero .eyebrow` (Updates/Budget/Guests/Travel/Stays/Mine hero) — gets **only** a gold color, nothing else — no explicit font-size or letter-spacing, so it falls back to plain paragraph text unless the browser's own default happens to look right
- `.sectionTitle .eyebrow` — gets only `margin`, no color/size

Because there's no shared definition, "eyebrow" doesn't reliably look like one design element across the app — it looks like whatever the nearest ad hoc rule happened to set. This is the more fundamental version of the Home-tagline problem from last session: that fix only touched `.eventHero>.eyebrow` specifically, not the `.eyebrow` pattern itself, so the same class elsewhere is still unstyled.

**Recommendation**: give `.eyebrow` one real base rule (font-size, letter-spacing, uppercase or not, color default), then let individual contexts only override what's genuinely different (like the Home one needing `white-space:nowrap`).

## 6. Dead CSS: `.groupCard` / `.groupGrid`

`app/guest.css` defines `.groupCard` and `.groupGrid` (a two-column card grid) — confirmed via grep that neither class is referenced by any JSX in either component file. Not a visible bug, but worth deleting during the cleanup pass so it doesn't get mistaken for the pattern to copy.

## 7. Type-scale drift: the "age-friendly" promise gets quietly overridden

`app/globals.css` has a section explicitly titled "Age-friendly type scale — nothing important below 12px" that sets `.jobCopy strong{font-size:15px}`. A later section in the same file ("Round 4 — sleeker rows...") redefines the same selector to `font-size:14px`, silently undoing part of that promise (14px is still above the 12px floor, so not a violation of the stated rule, but it does mean the file's own two passes disagree with each other on the same element). Worth deciding once, in one place, rather than leaving two rounds of history to reconcile by reading order.

## What's already consistent (don't touch)

- **Active/selected state**: `background:var(--navy-900)` (or the matching gold/blue accent) for the selected option is applied identically across `.eventTabs`, `.mineSegments`, `.eventSwitch`, `.venueSegments`, `.choiceRow`, `.channelChoices`, `.pickerPanel button.active` — this is a real, working design token already, not an inconsistency.
- **44px touch-target floor**: enforced deliberately in `app/touch-targets.css` and honored everywhere checked.
- **Safe-area handling** (Module 3) and the **Login/Home fixes** (Module 4, screen 1) from last session are holding — re-verified live, not just re-reading the diff.

## Suggested order for tomorrow

1. §1 + §2 + §3 + §4 together — they're the same root cause (no shared row token) and touch the same selectors, so fixing them separately would mean editing the same lines twice.
2. §5 (`.eyebrow` base style) — independent, smaller, but affects every screen's header area.
3. §7 (pick one `.jobCopy strong` size) — trivial once touching that selector anyway for §1.
4. §6 (delete dead CSS) — housekeeping, zero risk, do last.
