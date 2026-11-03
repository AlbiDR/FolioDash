# FolioDash working agreement

Read `docs/README.md`, `docs/architecture/cleanstack.md`, the relevant decision entries and `docs/operations/web-quality.md` before changing this project.

- The GitHub + user-owned Google Sheets + Apps Script direction is selected in FD-013. Read `docs/architecture/google-sheets-backend.md` before integration work. Framework, exact authenticated route/deployment ownership, scopes, retention and licence are still unresolved; do not silently settle them.
- GitHub secrets belong to deployment/CI, not browser runtime. Never publish Google credentials or private data to simulate live access. Prove the authenticated Google route with synthetic data before promising it works.
- Keep financial calculations pure and canonical; UI, parsers and persistence must not grow alternative implementations.
- Keep references to the existing Sheets implementation outside production dependencies. Do not change that working project as a side effect of FolioDash work.
- Never copy real financial files, private screenshots, account identifiers, credentials or exports into this repository, fixtures, logs, build output or public demos.
- Do not create empty speculative layers, placeholder services or a monorepo without a present requirement.
- Keep the root lean under CleanStack section 4.3. Documentation, source, scripts, configuration and assets go to their designated folders; root-level tool exceptions need a documented discovery/entry-point reason. No root scratch files, release ZIPs, private exports or parallel legacy implementations. Do not relocate user-supplied legacy/private folders without a scoped inventory and explicit migration authority.
- Keep one terminology, naming, token and error contract. Feature interfaces do not import other feature interfaces.
- Do not bypass a required check, weaken integrity validation to make a test pass, or call a mock/synthetic rendering a live product verification.
- After completing requested changes and the required checks, commit and push to the current branch's configured upstream by default. The owner explicitly requested this workflow. Do not force-push or treat this as authorisation for separate cloud provisioning, visibility changes or real-data migration.
- Distinguish unknown write outcomes from failures known not to have committed. Do not blindly retry financial writes.
- Financial imports, corrections, restoration and destructive actions require the documented user consent and recovery path.
- Cloud provisioning, publication, real-data migration, repository visibility changes and licensing need explicit task authority; documents are not blanket authorization.
- Report what was implemented, what was checked and what remains unverified. The application runs locally and CI runs `npm run verify`, but nothing is hosted and no branch or environment protection is enforced yet.
