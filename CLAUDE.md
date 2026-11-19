# Atlas Air 3D — working rules (from the project owner)

## Deployment — always follow
- Test everything **locally first** (`node tests/layout_test.mjs`, `npm run build`, headless browser run of the game).
- Then commit and push **directly to `main`** and deploy **to Vercel production** (project `atlas-air-3d`, https://atlas-air-3d.vercel.app).
- **Never** create preview deployments. Never deploy from side branches. Git auto-deploys are disabled on purpose (`vercel.json` → `git.deploymentEnabled: false`).
- If the owner says to wait, do not deploy until they say «انشر».

## Graphics
- No patch/workaround solutions for graphics. When art is needed, write an exact order (file names, metric sizes, axes, pivots) in `docs/ASSET_REQUESTS.md`; the owner builds the assets; install them exactly as delivered.
- If a delivered file is off-spec, report the measured values back to the owner; do not edit it.

## Communication
- Replies in Arabic, short, with screenshots as proof.
- No changes outside what was asked.
