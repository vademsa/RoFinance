# Common commands
- Install dependencies: `npm install`
- Development server (Express + Vite middleware): `npm run dev`
- Type-check/lint gate: `npm run lint`
- Financial-cycle regression tests: `npm run test:logic`
- Production build: `npm run build`
- Run production bundle: `npm start`
- Remove generated build outputs: `npm run clean`

Prerequisites: Node.js 20+, PostgreSQL 14+, `DATABASE_URL`, and a `SESSION_SECRET` of at least 32 characters. Optional runtime configuration includes Gemini and Google/Apple OAuth values described in `README.md`.

There is currently no test script in `package.json`. Use `npm run lint` and `npm run build` as the baseline completion checks.