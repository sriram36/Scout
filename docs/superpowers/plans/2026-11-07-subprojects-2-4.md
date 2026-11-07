# Scout sub-projects 2–4: tests, dashboard, more ATS adapters

Date: 2026-11-07. Builds on `2026-11-07-core-flow-fixes` (sub-project 1, done). The user asked to "complete the project and let me know", i.e. authorised finishing without further check-ins; the written design decisions below were therefore taken without a review stop and are recorded here instead.

## Decisions

- **One combined spec+plan** for the three remaining sub-projects (they share the engine and the report contract).
- **Same branch** (`feature/core-flow-fixes`); no merge to `main` (the user's call).
- **Dashboard redesign** (sub-project 3) was delegated to a design agent working only in `dashboard/` against the data contracts below; backend work (2, 4 and the contract pieces) is done in parallel in `src/` and `tests/`.
- **Honesty rule for adapters:** Workday, iCIMS and SmartRecruiters adapters are built from publicly known DOM conventions and tested on fixtures that mimic them. They are *not* verified against live company sites and the docs say so.

## Contract between backend and dashboard

- `fill_report` = `{ total, filled, skipped, errors, aiGenerated, stageBreakdown, details: { filled[], skipped[], errors[] } }`; every `details` entry has `field`, `label`, `meaning`; skipped/filled/error entries also carry `signature` (the exact key the matcher uses for learned mappings) so a dashboard correction can teach Scout.
- `GET /meanings` → `{ meanings: string[] }` (valid field meanings minus `unknown`).
- `POST /corrections` unchanged (zod-validated).

## Work

### Sub-project 2 — tests and verification
1. `SCOUT_PROFILE_PATH` env override so tests never touch the user's real `profile.json`.
2. `fieldSignature()`/`fieldLabel()` shared helpers; executor entries gain `label` + `signature`.
3. Routes extracted to `src/api/routes.js` (`/health`, `/profile`, `/meanings`, `/corrections`) and tested over real HTTP.
4. Characterisation tests: safety filter, fill plan, ATS detection.
5. Real-browser end-to-end tests with Playwright against fixture forms: fills contact/education fields, uploads the resume, leaves EEOC/work-authorisation fields untouched, never submits.

### Sub-project 4 — ATS adapters
1. Matcher honours `_knownMeaning` (it was set by the Greenhouse/Lever adapters but never read — their fast path was dead code).
2. Shared `src/adapters/pipeline.js`; generic, Greenhouse, Lever and Ashby become thin wrappers.
3. New adapters: **iCIMS** (form lives in an iframe; the pipeline runs against the frame), **Workday** (multi-step wizard; stops at sign-in walls; advances only via a Next/Continue button whose text is not Submit; never clicks Submit), **SmartRecruiters**.
4. Each new adapter has a fixture page and an end-to-end test.

### Sub-project 3 — dashboard (delegated)
Dark/light theme, pipeline kanban, stats charts, command palette, detail drawer with fill report and corrections UI, mark-as-submitted, demo mode, component split, screenshots in `docs/screenshots/`.

## Done when
`npm test` green (unit + E2E), dashboard builds, screenshots exist, docs updated, final fresh review fixed, and the report states what was and was not verified.
