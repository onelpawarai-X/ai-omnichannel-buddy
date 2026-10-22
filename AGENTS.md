<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

<!-- ZYRAXON:ENGINE:BEGIN -->
## ZYRAXON Studio — engine notes

ZYRAXON Studio is a browser cloud media editor whose editing agent drives the
timeline through tools. `src/lib/engine/` holds the engine, `src/lib/editor-store.ts`
the zustand store, `src/components/studio/` the UI, `src/routes/api/` the server
endpoints, `src/server/` the media worker.

### The provider drops audio. Send a spectrogram instead

This is the single most important thing to know before touching media input.

Measured against the live provider (`zyraxonai.lovable.app/api/public/zyraxon/v1`),
every audio content part is accepted with HTTP 200 and then silently discarded.
All of these were tried on all ten models and every one answered that it heard
nothing: `input_audio` (mp3, wav, ogg, flac, `mpeg`, no format, data-URL prefix),
`audio_url` (data URL and https), `audio` (data + format), `audio_content`,
`file` (`file_data` and `data`), and a public `http(s)` URL. Embedding the audio
track in an mp4 and sending it as `video_url` does not help either: the model
reports the frames and says there is no audio part.

What does work is a picture. `src/lib/engine/spectrogram.ts` renders the decoded
buffer as a labelled spectrogram PNG - time in seconds along the bottom,
frequency in kHz up the side - and that goes to the model as an `image_url`
part. The model reads it accurately: it distinguishes speech from music, finds
the harmonic stacks, counts the pulses and quotes the spacing back. Verified end
to end: given a 4 s track with eight pulses it reported "8 pulses, 0.5 s apart,
120 BPM" and cut the video on every one of them.

So the rule is: **audio reaches the agent as a spectrogram image plus the
numeric analysis (duration, loudness curve, beats, silence spans) as text.** Any
new audio path must do the same. Never re-add an audio part type expecting it to
work, and never write a comment claiming the provider reads audio - it does not.

`canHandle()` in `src/lib/zyraxon.ts` returns false for audio on purpose.

### What each modality actually needs

| Input | How it reaches the model | Notes |
| --- | --- | --- |
| text | `text` part | |
| image | `image_url` | `data:` URLs and `http(s)` both work |
| video | `video_url` | `data:` URLs and `http(s)` both work |
| audio | `image_url` of a spectrogram | no audio part works; see above |

Video also arrives as six extracted stills plus scene cuts; audio carries its
spectrogram on `MediaItem.spectrogram`, which travels with every agent turn for
pool audio and with the message for an attachment.

When adding a field to `MediaItem`, remember `applyOp`'s `add_media` case copies
fields one by one - a field not listed there is silently dropped.

### Model routing

`src/lib/engine/routing.ts` chooses the model. `pickDefaultModel` picks the
fastest model that reads text, image and video; the chat panel marks it with a
star and prints the real modality list. The catalogue advertises no audio
modality, which matches the measurement above.

### Running it

```bash
npm run dev        # dev server (the work host maps this to port 12000)
npx tsc --noEmit   # type check
npx vitest run     # unit tests
node .agent-tests/smoke.mjs       # browser smoke: loads, no console errors
node .agent-tests/e2e-beatcut.mjs # agent reads a spectrogram and cuts to the beat
```

`.agent-tests/` drives the app with Playwright against a running dev server. The
media worker exposes `ffmpeg`, `ffprobe`, `ImageMagick` and `python3` through
`POST /api/command`, writing into `$TMPDIR/zyraxon-renders` and serving results
from `/api/renders/<file>`.
<!-- ZYRAXON:ENGINE:END -->


<!-- ZYRAXON:LAYOUT:BEGIN -->
## Repository layout — where the deployable app lives

The **repository root is the Lovable project**. Lovable builds from the root,
so `.lovable/`, `src/`, `public/`, `vite.config.ts`, `tsconfig.json` and the
TanStack Start `package.json` must stay at the root. Do not replace them.

The newer `openreel-video` monorepo lives in `apps/` and `packages/` and is
untouched by the root app: the root app has no `@openreel/*` imports and builds
on its own with `npx vite build`.

If the monorepo ever needs its own root manifest back, it is in git history:

```bash
git show 7edf59b:package.json > package.json   # monorepo "openreel" manifest
```
<!-- ZYRAXON:LAYOUT:END -->
