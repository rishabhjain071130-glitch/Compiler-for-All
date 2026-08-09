# Phase 1: Project Setup

## Objective

Establish a clean, linted TypeScript monorepo workspace with a Node.js backend (Express) and a React frontend (Vite) configured for local development.

---

## Requirements

- Scaffold a workspace with two primary directories: `client/` and `server/`.
- Initialize `npm` workspaces or write a root `package.json` script using `concurrently` to launch client and server development modes simultaneously.
- Setup linting (`ESLint`) and formatting (`Prettier`) configurations at the root level and extend them.
- Create a simple health-check API endpoint `/api/health` returning JSON: `{ "status": "ok", "timestamp": "..." }`.
- Ensure absolute type safety using strict compile-time TypeScript rules in both subprojects.

---

## Technical Considerations

- **Port Allocations**: Server runs on port `5000`; Client runs on port `5173` (Vite default).
- **API Proxying**: Vite configuration in the client must proxy `/api` requests to `http://localhost:5000` to avoid CORS issues in local development.
- **Build Output**: Client build output must compile to `dist/`, and server build compiles to `dist/` inside their respective directories.

---

## Files/Components Expected

```
├── package.json (root)
├── eslint.config.js (or .eslintrc.json)
├── .prettierrc
├── client/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       └── App.tsx
└── server/
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── index.ts
        └── routes/
```

---

## Acceptance Criteria

1.  Running `npm run dev` at the root folder boots the Vite development server and Node server concurrently.
2.  Navigating to `http://localhost:5173` renders a basic React App page with no errors.
3.  Calling `GET http://localhost:5000/api/health` returns HTTP status `200` with the status payload.
4.  Running `npm run lint` and `npm run format:check` runs lint and style audits across all directories successfully.

---

## Things the agent must not do

- **DO NOT** install tailwind, bootstrap, styled-components, or any styling dependencies. Use vanilla CSS.
- **DO NOT** write code execution logic or create temp file directory managers.
- **DO NOT** install databases (SQLite, MongoDB, PostgreSQL). The application remains state-free regarding user database layers.
- **DO NOT** create dockerfiles or deployment charts yet.
