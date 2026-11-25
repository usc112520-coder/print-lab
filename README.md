# PRINT LAB

Responsive print request and classroom setup collaboration portal built with Google Apps Script and Google Sheets. Apps Script serves both the interface and server-side API; GitHub stores source. This project does not use Cloud Run.

## Included in this first release

- Dashboard with request counts, upcoming deadlines, and room distribution.
- Request form for J103, J101A, J101B, J104（系辦教室）, and 其他, with separate production notes, final artwork link, and optional reference example link.
- Users can add a custom room/location from the request form; saved locations are added to Settings and appear for future requests.
- Search and status/room filters, due date schedule, Google Drive artwork links.
- Admin review queue, approve/reject decisions, and append-only review history.
- Server-side authorization: only `usc1125520@g2.usc.edu.tw` can review requests.
- Sheets tabs created by `initializeDatabase()`: Requests, ReviewLogs, Users, Settings, Notifications.

## Setup

1. Create a private Google spreadsheet named `PRINT LAB｜印刷輸出管理資料庫` in the account that will own the service.
2. From that spreadsheet choose **Extensions → Apps Script**. Add `Code.gs` and `Index.html` from this repository, and add the `appsscript.json` manifest (enable **Show "appsscript.json" manifest file** in Project Settings if needed).
3. In Project Settings, set the time zone to `Asia/Taipei`. Run `initializeDatabase` and approve the requested Sheets permissions. It creates the five tabs and appends any newly introduced headers when rerun, without moving existing columns. The spreadsheet ID is stored in Script Properties; it is not committed to GitHub.
4. In **Deploy → New deployment → Web app**, choose **Execute as: User accessing the web app** and restrict access to the intended audience. Every user must have spreadsheet access for writes to work in this mode.
5. Deploy and open the `/exec` URL while signed into Google. Authorize the app on first use.

### Mixed Workspace and personal Gmail accounts

Apps Script's `Session.getActiveUser().getEmail()` can be blank in some web-app deployment and cross-domain contexts. The server deliberately fails closed when it cannot identify an account. Deploying as the accessing user generally makes the signed-in Google account available, but each user may be asked to authorize Apps Script and must have spreadsheet access. This also lets collaborators open and edit the underlying sheet directly: the interface's own-request filter does not provide row-level privacy or prevent direct edits. Use this mode only if every collaborator is trusted with the complete dataset. A school Workspace administrator can also restrict web apps or OAuth scopes. Verify both a school account and a personal Gmail before sharing broadly. For an owner-only sheet and private rows, a supported Google Identity Services login with server-side ID-token verification must be configured before deployment; do not substitute a client-side email field or trust an email supplied by the browser.

The administrator check is performed in server-side Apps Script on each review operation. Hiding the review page in the UI is only a convenience and is not the security boundary.

## Data and privacy

- Keep the spreadsheet private and share it only with intended users.
- Store artwork in Google Drive and paste its link into a request. Link access still follows the Drive file's own sharing settings.
- The repository is public. Never commit spreadsheet IDs, OAuth client secrets, private request data, or exported production data.
- The interface filters collaborators to their own requests and gives the configured administrator an all-request view. This is application behavior only: collaborators with sheet access can see and modify the underlying sheet directly. Review logs are appended by app actions but are not tamper-proof against sheet editors.

## Deploy updates with clasp (optional)

Install clasp locally, sign in with the Apps Script owner account, and run `clasp clone <script-id>` in a private local working copy. Copy the source files into that folder, then run `clasp push` and deploy a new version from Apps Script. Do not commit `.clasprc.json`, `.clasp.json` containing private IDs, or any credentials. Keep IDs in a local ignored file or Script Properties.

## Quotas and operational notes

Apps Script has per-account execution, runtime, and email quotas that Google may change. This first release does not send deadline emails automatically; the Notifications sheet is reserved for a later reminder feature. For low-volume classroom coordination, the web app and Sheets provide a simple starting point. Monitor Apps Script executions and current quota documentation before relying on it for time-critical production. Use a time-driven Apps Script trigger for reminders only after deciding who owns the sender account and testing recipient limits.

## Workflow

`待審核 → 待製作 → 製作中 → 待取件 → 已完成`; rejected requests are marked `退件`. The administrator can approve/reject and update production status from the review history view.
