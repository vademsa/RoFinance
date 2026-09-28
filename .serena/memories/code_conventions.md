# Code conventions
- TypeScript/TSX with ES modules and React functional components/hooks.
- JSX uses the automatic `react-jsx` transform; imports commonly include explicit `.tsx` extensions at entry points.
- Most source uses single quotes, semicolons, two-space indentation, and trailing commas in multiline constructs, though formatting is not fully uniform.
- Domain entities are interfaces in `src/types.ts`; component props are colocated interfaces.
- UI styling is utility-first Tailwind CSS with a dark-first visual design and Vietnamese user-facing copy.
- Server handlers validate untrusted request fields, use parameterized PostgreSQL queries, and protect private routes with `requireAuth`.
- Keep browser and server responsibilities separated: third-party secrets and Gemini calls remain server-side.
- No dedicated formatter or ESLint config is present; TypeScript `tsc --noEmit` is the configured lint gate.