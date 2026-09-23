# JEPA Experiment 002 pilot survey

A small survey for presenting static screenshot stimuli. It never loads, embeds, recreates, or interacts with a source website.

## Run locally

The dependency-free Python server stores local test responses as JSON:

    python server.py

Open `http://127.0.0.1:8002`. To listen on the local network, use `python server.py --host 0.0.0.0`. Stop it with `Ctrl+C`.

To exercise the Vercel functions locally, install Node.js 22 and the project dependency, connect a Neon database as described below, then run:

    npm install
    npx vercel env pull .env.local
    npx vercel dev

## Screenshot stimuli

Put static screenshot files in `public/stimuli/`. The included `placeholder-desktop.png` and `placeholder-mobile.png` are clearly labelled test images, not a real website. Replace them before collecting study data.

Register each website in `config/stimuli.json`:

    {
      "stimuli": [
        {
          "stimulus_id": "example-001",
          "desktop_image": "example-001-desktop.png",
          "mobile_image": "example-001-mobile.png"
        }
      ]
    }

Every `stimulus_id` must be unique. Image values are filenames relative to `public/stimuli/`. Use a new filename whenever an image's pixels change so browser and CDN caches cannot serve an old version.

Viewports up to 767 CSS pixels wide receive the mobile image. Wider viewports, including tablets, receive the desktop image. The choice is checked again immediately before each stimulus in case the viewport changed.

The exact image to be shown is loaded and decoded before the visible countdown begins. After `3`, `2`, `1`, it is displayed alone for an intended 1000 milliseconds, removed, and only then are Yes/No controls shown. While a participant answers, only the next configured image is prefetched. The recorded row includes the chosen variant, intended duration, measured duration, response, and server timestamp.

To add up to 100 stimuli, add both image files and append configuration objects. The browser randomises the complete configured order independently for each participant; the survey UI needs no changes.

## Deploy to Vercel Hobby

The deployment uses Vercel Functions plus a Neon Postgres database. Vercel's local filesystem is not used for deployed responses.

1. Push the project to a Git provider and import it into Vercel.
2. If this directory is inside a larger repository, set the Vercel project Root Directory to `jepa-lab/experiments/experiment_002`.
3. Select the **Other** framework preset. `vercel.json` supplies the static output directory, function settings, cache headers, and basic security headers.
4. In the Vercel project, open **Storage** or the Marketplace and add the **Neon** integration on its free plan. Make sure its `DATABASE_URL` environment variable is connected to Production; connect Preview too only if preview deployments should write to that database.
5. In the Neon SQL Editor, run `schema.sql` once. This creates the two response tables, an index, and the `survey_export` view.
6. Deploy or redeploy. Open the generated `https://<project>.vercel.app` URL; no custom domain is needed.

Do not commit `DATABASE_URL`. `.env.example` only documents the variable name. For command-line deployment, `npx vercel` and `npx vercel --prod` are equivalent alternatives after the Neon integration and schema are in place.

## Deployed response storage and export

`survey_sessions` stores one anonymous participant/session row. `stimulus_responses` stores one experimental response per shown stimulus, separately from the optional pilot feedback. The application does not store names, email addresses, IP addresses, cookies, or extra device fields. Hosting providers may retain their own operational request logs independently of these application tables.

To export analysis-ready CSV, run this in the Neon SQL Editor and use its result download:

    SELECT *
    FROM survey_export
    ORDER BY timestamp, participant_id, stimulus_index;

For JSON-shaped rows, run:

    SELECT row_to_json(survey_export)
    FROM survey_export
    ORDER BY timestamp, participant_id, stimulus_index;

Keeping export in the database console avoids exposing participant data through a public API and avoids Vercel Function response-size limits.

## Capacity notes for the pilot

At 1,000 complete participants and 100 stimuli, the application produces about 102,000 write requests: one session, 100 responses, and one completion per participant. This is below the current Vercel Hobby invocation allowance, but image transfer is the more likely free-tier constraint. Approximate transfer before cache reuse is `average image bytes ž stimuli ž participants`; monitor Vercel usage and keep screenshots appropriately compressed without changing their visible contents. Also monitor Neon storage and compute, and confirm that the pilot is eligible for Vercel Hobby's usage policy before launch.

## Local JSON storage and export

`python server.py` stores one file per participant in `data/responses/`. This mode is for local testing only; those files are ignored by Git and are not used on Vercel.

    python export_responses.py --format csv --output responses.csv
    python export_responses.py --format json --output responses.json

Incomplete sessions are included so mechanics failures remain visible. Use `--data-dir <path>` if the local server used a custom directory.

## Tests

Run both suites after installing the Node dependency:

    python -m unittest discover -s tests -v
    npm test
