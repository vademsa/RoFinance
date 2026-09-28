# Task completion checklist
1. Preserve the session-authenticated client/server data flow and the `user_data` top-level allowlist when adding persisted fields.
2. If the domain model changes, update `src/types.ts`, defaults/migrations in `App.tsx`, client save/load data, and relevant server validation/allowlists.
3. Keep authentication-required APIs behind `requireAuth`; never expose secrets to the client.
4. Run `npm run lint` after TypeScript changes.
5. Run `npm run build` for changes affecting bundling, server composition, dependencies, or deployment.
6. There is no automated test suite currently; explicitly report that limitation and perform targeted manual/command verification where appropriate.
7. Avoid editing generated `dist/` artifacts directly; regenerate them with the build command.