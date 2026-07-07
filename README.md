# Task Planner (auto-scheduling checklist + calendar)

## Run locally
    npm install
    npm run dev

## Deploy to Netlify

Option A — Netlify Drop (no account setup needed beyond login):
1. Run `npm install && npm run build`
2. Drag the generated `dist/` folder onto https://app.netlify.com/drop
   (A pre-built `dist/` is already included in this zip, so you can skip the build and drag it straight in.)

Option B — Git-connected site:
1. Push this folder to a GitHub repo
2. In Netlify: Add new site -> Import from Git -> pick the repo
3. The included `netlify.toml` sets the build command (`npm run build`) and publish dir (`dist`) automatically

Data is stored in the browser's localStorage under the key `planner-data-v1` (per-browser, per-device).
