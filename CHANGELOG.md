# Changelog

## 2026-08-31

### Desktop — Item details
- **Delete confirmation is now a real modal.** The "Delete this item
  permanently?" prompt used to appear as inline text/buttons inside the
  detail panel. It's now a centered dialog (`#delete-confirm-modal`);
  Cancel, clicking outside, and Escape all back out without deleting.
- **Added "Edit item"** to the detail panel's "⋮" menu, above
  Reprint/Download/Delete. It reuses the New Item modal pre-filled with
  the item's current values ("Save changes" instead of "Add new item")
  and calls a new backend `update` action instead of `create` — no new
  QR/label is generated, the panel just refreshes in place.
  - **Needs a manual backend deploy**: `backend/Code.gs` gained the
    `update` action and `updateItem_()`. Apps Script isn't deployed by
    CI — paste the updated file into the Apps Script editor and
    redeploy, or Edit item will fail with `unknown_action`.

### Desktop — Inventory table
- **Expiry column reformatted**: now shows `D/M/YYYY (relative)`, e.g.
  `2/11/2026 (2m)` — months once an item is more than 31 days from
  expiry, days otherwise (`(28d)`). Hidden on mobile as before, so this
  is desktop-only in practice.

### Search / QR label polish
- Desktop search palette's clear (×) button now only appears once the
  query is 3+ characters, instead of after the first keystroke.
- The QR label card's mouse-tilt effect gained a matching holographic
  sheen that tracks the cursor (`--holo-x`/`--holo-y` custom properties
  driving a gradient in `app.css`), instead of just tilting flat.

### Branding
- Renamed remaining "Storage Base" UI strings to **Minaza** (page
  title, iOS home-screen title, gate heading, settings footer/version,
  `manifest.webmanifest` name/short_name, the scan-mismatch toast) —
  the repo/README had already moved to Minaza, the frontend strings
  hadn't caught up.

Cache-busting bumped `58 → 68` across these changes (see `index.html`'s
`?v=` query strings).
