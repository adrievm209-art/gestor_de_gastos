# AGENTS.md

## Repo shape

- Static, dependency-free app: `index.html` → `style.css` + `script.js`. No `package.json`, build, test, lint, or CI config.
- Open `index.html` directly, or use VS Code Live Server on port **5501** (`.vscode/settings.json`).
- Available verification: `node --check script.js`. There is no automated test suite.

## Architecture

- `script.js` is a single IIFE with object modules: `Utils`, `Toast`, `Store`, `State`, `Calculations`, `Cycle`, `Actions`, `Render`, `App`. Boot is `DOMContentLoaded → App.init`.
- Do not switch to ES modules without handling `file://` loading; the app currently works by opening the HTML directly.
- State lives only in `localStorage['gestor-gastos-state-v1']`. Shape changes must update `State.createDefault`, `State.normalize`, and the `clean*` helpers; bump the key or migrate for breaking changes.
- Dynamic markup is built in `Render` via `innerHTML`. Use `Utils.escapeHtml` for every user-supplied string added there.

## Domain rules (easy to break)

- Balance = month income − month expenses − month `goalTransactions` − effective emergency allocation. The emergency allocation is clamped to the balance available after expenses and goals.
- Limit inputs render blank when the value is `0`; `Actions.setLimits` treats an empty string as `0`. Do not repopulate zeros in `Render.controls`.
- Goal monthly contributions are stored as `goalTransactions` (`source: 'monthly'`) created at goal creation and on rollover. Do not reapply a month that already has one; deleting a goal also removes its transactions.
- `Cycle.closeMonth` archives totals once per month (idempotent via `history`) and adds reserved emergency plus any positive leftover to `emergencyFund`. Rollover runs on load when the stored month is behind today.
- Reset is gated by `<dialog id="resetDialog">` and PIN **`12345`**. Keep the dialog/error UX rather than reverting to `window.confirm`.

## UI theming and layout

- Theme is `body[data-theme]` (`light`, `dark`, `brutal`) with CSS variables. All themes share one `grid-template-areas` model; reordering panels means editing the single desktop `.layout` block **and** the single `≤1080px` block.
- `.main-column` and `.side-column` use `display: contents`; panels are placed by `grid-area`. Visual order does not follow DOM order.
- Theme buttons show icons only; accessible names are in `aria-label`/`title`.
- Palette intent: light primary = dark green, dark = solid black with wine tones, brutal primary = purple replacing pink.
