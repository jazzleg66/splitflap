# Third-Party Notices

Digital Solari is released under the MIT License. This file records bundled
runtime assets and third-party services that operators may enable.

## Bundled Assets

- `assets/audio/split-flap.wav` is a procedurally generated mechanical click
  loop created for this project. It is covered by the repository's MIT License.
- The app loads Google Fonts (`Doto`, `Red Hat Text`, and `Roboto Mono`) from
  Google Fonts at runtime.

## Optional Services

These services are disabled unless the corresponding environment variables are
set:

- Sentry browser and Node error monitoring (`SENTRY_DSN`)
- PostHog product analytics (`VITE_POSTHOG_KEY`)
- Supabase session persistence (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`)
