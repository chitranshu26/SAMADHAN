# Existing control connections

The original landing page, layout, branding and default styles are retained. The additional light-theme rules apply only when the existing theme switch selects light mode.

Implementation changes:

- KPI active-case navigation now filters open stages correctly.
- Institution and officer chart drilldowns map to database filter columns.
- Chart and map drilldowns retain selected analytics date and bureau filters.
- Case-report downloads are restricted to the selected, authorized complaint.
- Logout, login and password-change navigation clear the prior account's query cache.
- DA intelligence navigation supports the assigned-case scope, with other cases restricted.
- Replay controls refresh persisted session state, save changed filters and pause at the end of available events.
- Notice and investigation-date actions convert browser-local dates to UTC before submission.
- Optional financial amount submission and evidence file selection match backend validation.
- Dataset import controls read the checked-in schema instead of an ignored development file.
- Dialogs support Escape, keyboard focus containment and returning focus to the invoking control.

No automated tests, browser retests, builds, or deployment were run for this changeset, as requested. These are code changes, not verified runtime results.
