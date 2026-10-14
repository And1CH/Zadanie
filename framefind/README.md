# Framefind

Asset discovery for video editors, as a server application and a downloadable single-file browser edition. Both editions share the search engine; neither requires npm dependencies or API keys.

## Run

Node.js 22+ and curl:

```sh
cd /workspace/asset-finder
npm start
```

The server listens on localhost port 3000. `PORT` overrides the port. Public retrieval respects the host HTTPS proxy and certificate trust; no TLS or artifact verification is disabled.

To regenerate the downloadable edition:

```sh
npm run build:standalone
```

Open `share/Try-Framefind.html` in a browser. It stores your library on your device and queries public providers directly. Browser CORS rules, network policies, storage settings, and provider availability can restrict retrieval. It does not use a hosted backend. This cloud browser blocks file navigation administratively, so standalone behavior was tested over a static HTTP server without the application backend.

## Implemented workflow

- Natural-language requests are converted into useful search terms. Known filler is removed; people, places, and descriptive terms remain.
- Refinements preserve the subject, replace conflicting lighting/mood terms, apply exclusions, recognize exact years and before/after bounds, and order older/newer candidates by source dates. This is rule-based query parsing, not an LLM.
- Wikimedia Commons supplies image results with descriptions, authors, licenses, and originals. Internet Archive supplies video/audio candidates. Archive queries use AND between terms to avoid unrelated matches from individual words. A second, broader query is attempted when needed.
- Results are deduplicated, ranked against title/description/tags, labeled with matched terms, and filtered by explicit exclusions and dates. A text match does not prove visual similarity, mood, or identity.
- Images can be previewed. Compatible video/audio files can be previewed where the source and browser permit playback. Save/remove, manual source import, and direct media links work in both editions. Re-saving an existing source updates its record.
- Add SRT or VTT captions to a saved video by pasting text or choosing a caption file. The quote finder parses real cue timestamps and searches exact phrases, including phrases spanning adjacent cues. It returns the caption segment and its text, and supports seeking a compatible media preview to the segment start.
- Internet Archive candidates can also be checked for publicly available SRT/VTT captions. Missing captions, unreadable captions, and an absent exact phrase produce distinct messages. No timestamps are fabricated. Captions alone do not verify speaker identity or visual context.

## Example requests

- `Please find a photo of a sunset over the ocean` then `warmer lighting`.
- `Tom Holland interview` then `an older episode` or `before 2018`.
- `dramatic piano` then `not dramatic, quiet`.
- Search for a candidate, choose **Find a spoken quote**, and enter exact words from available captions.

## Verification

```sh
npm test
```

Unit/API tests cover query correction, exclusions, years, ranking, provider query construction, SRT/VTT parsing, exact-phrase evidence, missing phrases, preview selection, and caption import. They use an isolated data directory and mocked provider responses for deterministic retrieval tests.

With Playwright and `/usr/bin/chromium` available, `node functional-check.cjs` verifies both editions through the browser: caption import, quote match at a known timestamp, negative match, persistence, search interpretation, refinement, removal, and mobile layout. Temporary fixtures are removed after successful checks. The older `browser-check.cjs` is a live-provider smoke check and requires provider access.

Current live internet validation is blocked: cloud HTTPS proxy requests to the public sources return CONNECT HTTP 403, despite domain entries being saved in environment configuration. This is separate from passing local/API/browser tests. No current live-search success is claimed.

## Remaining work

Broad internet video discovery, authenticated/licensed catalogs, automatic speech transcription, visual scene matching, semantic model-based refinements, generated alternatives, and editor integrations remain unfinished. Deleted or inaccessible footage cannot be recovered by this prototype. Music/audio candidates are not automatically licensed for reuse; inspect each original license.

`data/` contains local user library records and cached images. This is a single-user development application with no authentication; public deployment requires a separate hosted configuration and access model.

## Credential-free asset retrieval

Images now query Openverse and Wikimedia Commons concurrently. Audio queries Openverse. Candidate queries include the original description, common alternatives (e.g. elderly/stroking for old/petting), and a less restrictive subject query. Source replies are normalized, deduplicated, and ranked by their real titles, tags, and descriptions. A failed source does not discard results from successful sources. Text relevance is not visual scene verification. License and source attribution are preserved.

The downloadable edition performs those requests directly in the browser and needs neither an API key nor a hosted backend for this workflow. Its library remains local. Browser/source CORS settings, provider availability, and anonymous request limits still apply. It contains no hardcoded search results. Optional Pexels search remains server-side and requires PEXELS_API_KEY; its failure falls back to public sources.

The initial background search has been removed so it cannot block the first submit. Search feedback appears beside the submit button, and submitting scrolls to the outcome. The downloadable edition can show interim candidates while the remaining queries run. Cancel stops the browser request and preserves the typed description. Unreachable sources and a completed search with zero relevant candidates have different messages.

### Validation boundaries

`npm test` exercises retrieval with provider-response fixtures, query construction, normalization, relevance ranking, fallback and failure behavior, captions, and the API. `npm run test:retrieval-browser` controls provider responses in a test-only browser context and verifies the user's exact description, card rendering, image preview, save/remove, explicit network failure, zero results, and cancellation. These passing checks do not establish that a real public source returned the example image.

Live validation is blocked by the cloud egress proxy: CONNECT requests to api.openverse.org return HTTP 403. The Openverse domain was added to the saved environment draft, preserving other domains. Review/save/publish the network configuration, then rerun the live search. No live image retrieval success or public deployment is claimed. The downloadable file can be tried on an ordinary browser network independently of this cloud policy.
