# Workforce Junction — Request & Termination Workspace

A multi-user web app for filling out and tracking:
- **Client Termination Checklist**
- **Change Request Form (CRF)**

Built with **HTML, CSS, vanilla JavaScript** on the frontend and **Node.js (Express) + SQLite** on the backend, so it runs as a normal web server that any number of people can open in their browser at once.

Branded for **Workforce Junction / HR Governance Solutions** (hgsi.in) with your logo throughout the app and in every exported document.

---

## 1. What's included

```
wj-app/
├── server.js            Express server + REST API + colorful branded DOCX-format export
├── schema.js             Shared form definitions (sections, fields, categories)
├── schema.sql             SQLite table definitions
├── package.json
├── public/
│   ├── index.html          Page shell
│   ├── images/logo.png     Your Workforce Junction logo (used in the app and in exports)
│   ├── css/style.css       Full custom design system (colors, responsive layout, components)
│   └── js/app.js           All frontend logic (home page, sidebar nav, both forms, autosave)
└── data.db               Created automatically on first run (SQLite database file)
```

## 2. Running it locally

Requirements: **Node.js 22.5 or later** installed (the app uses Node's built-in SQLite support — no native module compilation needed, no Visual Studio Build Tools required).

```bash
cd wj-app
npm install
npm start
```

Then open **http://localhost:3000**. The SQLite database (`data.db`) is created automatically the first time you run it.

## 3. What's new in this version

- **Real home page** — hero section, live stats (total/in-progress/completed), quick-access cards, and an About strip linking to hgsi.in. This is the first thing you see now, not a form.
- **Sidebar navigation** — Home / All Submissions / Completed / New CRF / New Termination Checklist, with live counts. This is app navigation, not a per-task jump list.
- **Your logo** — embedded in the header, home page, and every exported document (no external image dependency).
- **Simplified 4-stage status** — every task/section now uses one pipeline: **Requested → Approved → Testing → Completed**, shown as a colored pill, instead of a cluttered field-per-row layout.
- **Completed tracking** — completed tasks collapse into a "✓ N completed" toggle within each section; a dedicated **Completed** view lists fully-finished submissions; progress bars throughout.
- **Add / edit / delete tasks** — every checklist section has an "+ Add task" input, every task label is directly editable, every row has a delete button. Same for the CRF's Change Category list.
- **Colorful, branded export** — the downloaded `.doc` now has colored section headers matching the app's palette, colored status pills, and your logo at the top.
- **Fully responsive** — the sidebar collapses behind a menu button on mobile/tablet, and all layouts (home cards, forms, task rows) reflow for narrow screens.

## 4. Making it accessible to your whole team

Right now it runs on your machine only (`localhost`). To let anyone on your team access it from their own browser, deploy it to a small always-on server:

- **Render / Railway / Fly.io** — connect the project folder as a Node.js web service; they'll run `npm install && npm start` automatically.
- **A company VM / EC2 instance** — install Node.js, copy the folder over, run `npm install && npm start` (ideally under `pm2` so it stays running), and open the server's port (default 3000) or reverse-proxy it behind Nginx with HTTPS.
- **Docker** — wrap it in a simple Dockerfile (`FROM node:20`, copy files, `RUN npm install`, `CMD ["npm","start"]`).

> Note on the database: this uses Node's built-in `node:sqlite` module (available since Node 22.5), stored as a single file (`data.db`) — great for a small internal team tool, with zero native dependencies to compile. If usage grows heavily, the same schema (`schema.sql`) can be pointed at Postgres/MySQL with changes to `server.js`.

## 5. How the app is organized

- **Home** — hero, stats, quick-access cards, recent submissions.
- **All Submissions** — every CRF and Termination Checklist, filterable by type, with a completion-percentage ring per card.
- **Completed** — only fully-finished submissions.
- **Client Termination Checklist** — every section from the source document (CRM, EDI, Analytics & Reporting, Systems Configuration, Benefits Desk, Accounting & Finance, Sales), each task with a 4-stage status, owner, notes, and add/delete controls.
- **Change Request Form** — Request, Suggested Solution, Note, Approval & Fees, Final Solution, Action Required & Statement of Work, and the full Change Category matrix — each section tracked with its own status and owner.
- **Autosave** — every field saves to the database automatically (debounced) with a "Saving… / Saved" indicator in the top bar.
- **Download .doc** — generates a Word-compatible document reproducing the original layout with color-coded sections, status pills, and your logo.

## 6. Data model (SQL)

Two tables (see `schema.sql`):
- `submissions` — one row per CRF or Termination Checklist (client, broker, header fields, long-form content, timestamps).
- `tasks` — one row per checklist item / CRF section / category, each with its own `status` (requested/approved/testing/completed), `assignee` (owner name), `completed_on` date, and `notes`.

## 7. Known limitations

- Screenshot/image attachments for the CRF's Statement of Work are **referenced by text/link only** rather than uploaded directly.
- The "Download .doc" export is a Word-compatible HTML document (opens correctly in Microsoft Word, matches the original's headings/tables/layout and now includes color + your logo) rather than a native binary `.docx`.
