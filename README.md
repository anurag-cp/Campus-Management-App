# Campus Projects

A full-stack project management app for college coordinators, faculty guides, and students. It helps teams organize project work, share progress, receive feedback, and track attendance.

## Features

- Role-based workspaces for coordinators, guides, and students.
- Coordinator tools for managing student and guide accounts and forming teams by project domain.
- Student submissions, weekly progress reports, and project diary entries.
- Faculty submission review, team feedback, ratings, and attendance records.
- Responsive interface for desktop and mobile screens.
- Persistent SQLite database with relational tables for users, teams, submissions, diaries, remarks, and attendance.
- Server-side role checks, role-scoped data responses, and salted password hashing.

## Technology stack

- **Frontend:** TypeScript, Vite, HTML, and CSS
- **Backend:** Node.js and Express
- **Database:** SQLite using Node's built-in `node:sqlite` module

## Requirements

- Node.js 22.13 or newer (required for `node:sqlite`)
- npm

## Run locally

```bash
npm install
npm run dev
```

The development command starts both the API and Vite frontend. Open the local URL printed by Vite (usually `http://localhost:5173`). Vite proxies `/api` requests to the backend on port `3001`.

On first launch, the backend creates `backend/data/projects.sqlite` and seeds demo accounts. The database file is ignored by Git so personal/local data is not committed.

### Demo accounts

| Role | Campus ID | Password |
| --- | --- | --- |
| Coordinator | `COORD001` | `admin123` |
| Guide | `GUIDE001` | `guide123` |
| Student | `STU001` | `student123` |

These credentials are for local demonstration only. Change or remove seeded credentials before using the app in a shared or production environment.

## Build and production run

```bash
npm run build
npm start
```

The production server serves the built frontend and the API from port `3001` by default. Configure the backend with environment variables:

- `PORT` — HTTP port (default: `3001`)
- `HOST` — bind address (default: `127.0.0.1`)
- `DB_FILE` — SQLite file path (default: `backend/data/projects.sqlite`)

## API overview

Authenticated requests use the bearer token returned by sign-in.

| Method | Route | Purpose | Access |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Health check | Public |
| `POST` | `/api/auth/login` | Sign in | Public |
| `GET` | `/api/auth/me` | Current account | Signed-in users |
| `POST` | `/api/auth/logout` | End session | Signed-in users |
| `GET` | `/api/state` | Role-scoped project data | Signed-in users |
| `POST` | `/api/users` | Add student or guide | Coordinator |
| `DELETE` | `/api/users/:id` | Remove an unassigned student | Coordinator |
| `POST` | `/api/teams/form` | Form teams of up to four | Coordinator |
| `POST` | `/api/submissions` | Create a project update/report | Student |
| `PATCH` | `/api/submissions/:id/review` | Mark a submission reviewed | Coordinator or assigned guide |
| `POST` | `/api/diaries` | Add a project diary entry | Student |
| `POST` | `/api/remarks` | Give team feedback | Assigned guide |
| `POST` | `/api/attendance` | Record session attendance | Assigned guide |

## Project structure

```text
backend/
  server.ts       Express API and access rules
  store.ts        SQLite schema, seed data, and persistence
  types.ts        Backend data types
src/
  main.ts         TypeScript frontend and API integration
  styles.css      Responsive visual design
index.html        Vite frontend entry point
vite.config.ts    Development API proxy
```

## Current scope and limitations

- This is a prototype. Demo accounts are seeded automatically when the database is empty.
- Sessions and login rate limits are held in server memory; active sessions end when the server restarts.
- Project submissions currently store metadata and descriptions. File uploads are not implemented.
- The SQLite store currently loads records into memory and writes the data back transactionally when it changes; targeted queries and migrations would be preferable for larger deployments.
- Before production use, add durable session management, account recovery, automated tests, deployment configuration, and database backup procedures.

## License

No license has been selected yet. Add a `LICENSE` file before redistributing this project publicly.
