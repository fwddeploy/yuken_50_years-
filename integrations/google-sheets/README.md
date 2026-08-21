# Google Sheets connector

This connector keeps D1 authoritative for live event operations while synchronising human-edited Master data with one Google workbook.

1. Create a standalone Apps Script project and copy `Code.gs` and `appsscript.json`.
2. In **Project settings → Script properties**, set `YIL_SPREADSHEET_ID` to the Master workbook ID and `YIL_SYNC_SECRET` to a new random secret of at least 32 bytes.
3. Deploy as a web app executing as the workbook owner. Copy the `/exec` URL.
4. Add the URL as `GOOGLE_SHEETS_WEB_APP_URL` and the same secret as `GOOGLE_SHEETS_SHARED_SECRET` in the Sites environment. Never commit either value.

App edits enter `sheet_sync_outbox` in the same D1 batch as the application change. Failed deliveries remain queued with bounded exponential retry. A core-committee pull first produces the existing signed impact preview; removals are applied only after confirmation of that exact Sheet version.
