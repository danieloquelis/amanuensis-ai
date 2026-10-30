# Sheet reading plan: from a page or a text to the score

Status: phase 0 done on 30 October 2026; phases 1–2 implemented the same day (not yet committed): attachments, the `modules/page` detector, `music_read_source`, `page_check` and `score_write.pitches`. Through the whole agent loop, clean fixture pages read at 75–100% pitch accuracy (most 95–100%), with rhythm at 100% on 9 of 13 (see the research's phase 2 section). Spark alone reads only about half the pitches of a staff. With a computer vision notehead detector labelling each head's line or space, and the same heads listed as text, it reads 89–100% of the pitches on most clean pages at low effort, and follows a real engraved page (Chopin) almost note for note; Muse Wonder reads no better for four times the price (see [sheet reading research](../research/sheet-reading.md)). So the detector is part of the feature, and the agent's tools loop through read, detect, write and check. Order: the product owner chose on 30 October to build this plan's phases 1–2 now; phases 1–2 of the [triplets plan](triplets-plan.md) follow (until then triplets are approximated, as decided below). Written 30 October 2026 against commit `fdc5613` (main). The document is self-contained: a session implementing it needs only the repository, `AGENTS.md`, [code conventions](../architecture/code-conventions.md) and this plan.

## Goal

A musician gives the assistant music that already exists somewhere else, and it appears in the score, correct and editable:

- a **photo or scan** of printed sheet music, or a **PDF** of it;
- a **handwritten** page (staff paper, a sketch on a napkin);
- **text a person wrote**: a chord chart (`| C | Am | F G |`), lyrics with chords above them, note names ("C D E, E F G"), solfège, ABC notation, guitar tab.

The assistant **reads and reasons first**, as a musician would: what piece it is, its key, meter and tempo, its parts and clefs, its form (sections, repeats), what our score cannot hold, and which spots are unclear. Only then does it write, part by part and a few bars at a time, through the same score tools it uses today. Finally it checks what it wrote and tells the musician what it changed, approximated or could not read.

Everything goes through the agent and its tools. Nothing is drawn straight from the page: the engraver draws only what the score holds, as always.

## Verified starting point

| Fact | Where |
| --- | --- |
| The compose bar already has a disabled paperclip: "Attach an image or PDF · coming soon". | `modules/assistant/ui/components/Composer.tsx` |
| The model port is text only: `ChatMessage.content` is a string. | `modules/assistant/application/model-port.ts` |
| The Meta adapter sends OpenAI-style Chat Completions to `https://api.meta.ai/v1`, model `muse-spark-1.3` by default (`META_AI_MODEL` overrides it; development uses `muse-spark-1.3-contributor` with `META_AI_REASONING_EFFORT=low`), with a 3-minute deadline per call. | `modules/assistant/infrastructure/meta-model.ts`, `.env.local` |
| Muse Spark 1.1–1.3 take text, image, video, audio and PDF input (1M-token context). | [Model catalog](https://dev.meta.ai/docs/models) |
| Images go in **user** messages as `{"type":"image_url","image_url":{"url":…}}` (public URL or base64 data URL); JPEG, PNG, GIF, WebP; up to 50 MB inline and 50 images per request; a ~1280 px image costs about 1,300–1,500 tokens; the model may resize. | [Image understanding](https://dev.meta.ai/docs/image-understanding) |
| PDFs go as `{"type":"file","file":{"filename":…,"file_data":"data:application/pdf;base64,…"}}`; the model gets extracted text and a raster of each page; text from the first 100 pages, page images from the first 50 (they count toward the 50-image budget). | [File handling](https://dev.meta.ai/docs/file-handling) |
| The text route caps a request at 1 MB (`MAX_REQUEST_BYTES`) and an instruction at 2,000 characters. | `modules/assistant/application/handle-request.ts` |
| The voice route already sends a file beside the request as multipart (`audio` + `request` JSON), with its own size cap. | `app/api/assistant/voice/route.ts` |
| One turn runs at most 12 model steps (`MAX_TOOL_STEPS`); both routes allow 300 s (`maxDuration`). | `run-assistant.ts`, `app/api/assistant/**/route.ts` |
| A score holds at most 32 bars, 8 parts and 4,096 events. | `SCORE_LIMITS` in `modules/score/domain/schema.ts` |
| The agent writes bars as score text (`score_write`), reads them back (`score_get_context`, which can read only some parts or bars), and asks the musician with a question and choices. Score text holds concert pitch. | `modules/assistant/application/*`, `SCORE_TEXT_GUIDE` |
| Notation the score cannot hold yet: tuplets (triplets are planned), hairpins, nested repeats and alternate endings, mid-score key, clef or instrument changes, lyrics. | `UNSUPPORTED_NOTATION` in `score-tool-gateway.ts` |

Not yet verified (phase 0): how accurately Spark reads notes, rhythms, accidentals and key signatures from real pages; latency; cost per page across the steps of a turn.

## Decisions

### A detector measures, Spark reads

Spark reads the page as a musician would: clefs, key, meter, form, rhythm, text, chords, voices. It cannot measure which line or space a notehead sits on (about half right, and more thinking makes it worse). A small notehead detector does that measuring, by classic image processing, free and in about a second per page:
- **Staves:** five evenly spaced dark rows, gaps allowed.
- **Heads:** filled and hollow ovals at every line and space, ledger positions included, with rules from engraving (a filled or half note has a stem; a whole note has none; beyond the staff a head sits on a ledger line; a beam is a thick stroke, a staff line a thin one).
- **Barlines:** strokes from a staff's top line to its bottom line that are no head's stem.

Its result reaches Spark twice: as small red labels on the page (letter and octave on the staff's clef, no key signature or accidentals) and as text, one line per staff with `|` at barlines. Spark applies the key signature and accidentals itself.

The detector lives in a new framework-free module, `modules/page` (pixels in, staves, heads and barlines out), with image decoding, enlarging and labelling (sharp) in its server-only infrastructure. It handles clean images: screenshots, scans and digital pages. Phone photos (angled, curved, unevenly lit) and handwriting give no staves today; the agent then reads the page alone and says the pitches need checking. No OMR engine is added; that remains the fallback if real pages show the detector cannot keep up.

### Reasoning first, enforced by a tool

An import turn has three steps, and the gateway enforces their order:

1. **Read.** The agent calls a new tool, `music_read_source`, with its reading of the material. Its schema:
   - `kind`: engraved, handwritten, chord chart, lyrics with chords, note names, ABC, tab;
   - `title`, `composer`, `parts` (name, instrument it maps to, clef or clefs, transposing or not);
   - `key`, `meter`, `tempo`, `pickup`;
   - `bars`, the bar count; `sections` and `repeats`;
   - `staves`, for each attached picture: the clef of every staff down the page, system after system (what the detector needs to name heads);
   - `unsupported`: notation our score cannot hold;
   - `unclear`: each spot it could not read with confidence, as bar, beat and what it guessed.

   The tool returns what fits and how to proceed. It compares the reading with `SCORE_LIMITS` (only bars 1–32 fit, so write those and say so) and with the unsupported list (how each item will be approximated, or that it will be left out). For each picture whose staves the detector finds as read, it also returns the heads as text, and the labelled picture follows as the next message. When the detector finds a different number of staves, the result says so and the agent reads that page alone.
2. **Write.** Only after a reading does the gateway accept writes in an import turn. Without one it answers "Read the source first: call music_read_source". The agent sets up the score with one `newScore`: instruments, meter, key, tempo and bar count from the reading. It then writes with `score_write`, at most 8 bars per call, a part (or a grand staff) at a time. Progress lines say "Reading the page" and "Writing bars 9–16, piano".
3. **Check.** The agent calls `page_check`, which compares what was written with the detector's heads, bar by bar and staff by staff: each written note's line or space (written pitch, accidentals aside) against the heads found in that bar on the page. It returns only the bars that differ ("bar 2 piano: the page has A4 where you wrote nothing; you wrote D6 where the page has C6"), and the agent fixes or keeps each, knowing the detector also misses heads and sees noise (digits, flags). Bar count, meters and key are checked against the reading. Then it reports, in the turn's reply:
   - what it wrote;
   - what it approximated, and how;
   - what it left out;
   - the unclear spots, by bar and beat.

The reading is also shown in the chat, short: "Ballade in G minor, 6/8, piano, 24 bars; triplets written straight in bars 9–10; bar 17 unclear". It doubles as the turn's audit trail.

### Copy what is on the page: written pitches

A transposing part's page shows written notes, such as a B♭ trumpet part. Score text holds concert pitch, and asking the model to transpose while reading invites mistakes. `score_write` gains `pitches: "concert" | "written"` (default concert). With `written`, the lines of transposing parts are converted to concert pitch with the existing `toConcert`; other parts are unaffected. The agent copies what it sees, and the domain does the arithmetic. The same rule holds for guitar, which is written an octave up.

### Where the music goes

- **An empty score** (a new sheet) is filled directly; Undo restores it. This follows "act, don't ask".
- **A score that already has music** gets one question with choices: "Replace the score", "Add after bar N", "Add as new parts". This is the ambiguous case where asking is right.

### What the score cannot hold is approximated or left out, and always said

- Triplets: written as the nearest straight rhythm, with a note in the reply. When the triplets plan lands, they are written as triplets.
- A pickup (anacrusis): written as its own first bar, padded with rests before it, with a note.
- Hairpins: left out.
- First and second endings: written out in full.
- Lyrics: left out. Chord symbols above the lyrics are kept.
- A key or meter change mid-piece: meter changes are supported; a key change is written in the opening key, with a note.
- Over 32 bars or 8 parts: the first whole sections that fit.

Each case is reported, never silently dropped.

### Attachments are files beside the request

The text route becomes multipart, like the voice route: `request` (the JSON it takes today) plus `files`.
- **Limits:** up to 10 files and 20 MB in all; the JSON keeps its 1 MB cap.
- **Images** are resized in the browser to at most 2,000 px on the long side (JPEG, quality 0.85). This saves bytes and tokens, and the model resizes anyway. A photo the browser can decode in another format, such as HEIC on Safari, is converted the same way. Supported: JPEG, PNG, WebP, GIF.
- **PDFs** go as they are, up to 50 pages read visually.
- **Text files** (`.txt`, `.abc`, `.tab`) are read in the browser and sent as text, up to 50,000 characters.
- **Long pastes:** pasted text longer than 1,500 characters becomes a text attachment automatically (a chip "Pasted text · 3 KB"), so the 2,000-character instruction limit stays for instructions.

Only the musician's request message carries attachments; the API allows images only in user messages. They are not saved with the chat: a saved turn keeps each file's name and kind, so the chat says "♪ score.pdf" but holds no bytes. Retry in the same session keeps them in memory, as it keeps a take today.

### The model port learns content parts

```ts
type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; dataUrl: string }
  | { type: "file"; filename: string; dataUrl: string };
// user messages: content: string | ContentPart[]
```

The Meta adapter maps them to `text`, `image_url` and `file` parts. Nothing else in the assistant sees the wire format. The scripted test models accept the new shape unchanged.

## Phases

Each phase leaves the app working and all checks green: `yarn check`, then `yarn build && yarn test:e2e`.

### Phase 0: measure how well Spark reads music (a gate, no app changes)

A script, `scripts/sheet-reading-eval.mts`, run by hand against the real API and never in CI:
- **Sources:**
  - the engraving baselines we already have (`tests/e2e/engraving.spec.ts-snapshots/*.png`), whose exact scores are in `tests/fixtures/engraving/*.json`;
  - a few real pages the product owner supplies, in `tests/fixtures/sheets/` (public domain or our own): a printed lead sheet, a piano page, a phone photo at an angle, a handwritten page, a chord chart.
- **Output:** for each source, Spark's reading and score text are compared with the truth:
  - key, meter and bar count right;
  - pitch accuracy per note (spelling-aware);
  - rhythm accuracy per bar; chords right;
  - tokens, latency and cost.
- **Conditions compared** (Spark 1.3, the model in use; 1.2 is tried only if 1.3 fails the gate, since its only known advantage is audio):
  - reasoning effort low (today's setting) against medium and high: reading a page may need more thought than an edit, and turns with attachments could raise it;
  - 1,280 px against 2,000 px images;
  - a whole page against one system at a time.
- **Results** go to `docs/research/sheet-reading.md`.

**Gate:**
- On clean printed pages, key, meter and bar count are right, and most pitches and rhythms are right.
- Unclear spots are reported rather than invented.
- One page fits in a turn of about 60 seconds.

If Spark fails the gate, stop and reconsider the recognizer fallback.

### Phase 1: attachments end to end (no music behaviour yet)

- Model port and Meta adapter: content parts as above. Unit test: the adapter's request body for an image and for a PDF matches Meta's documented shape.
- `handle-request.ts`: the request carries `attachments` (kind, name, media type, data), limited as above, and puts them in the first user message.
- `app/api/assistant/route.ts`: multipart in (`request` + `files`), with its own body cap.
- `assistant-client.ts` sends multipart when there are attachments.
- `Composer.tsx`:
  - the paperclip opens a file picker (images, PDF, text);
  - files can also be dropped on the compose bar, or pasted (images from the clipboard, long text);
  - chips show a thumbnail or the file icon, with a name and ×;
  - limits are explained in place.

  Image resizing goes in a small `assistant/ui/hooks/use-attachments.ts`. The rules live in `assistant/application/attachments.ts`: kinds, limits, the long-paste threshold.
- The chat bubble shows the attached files, as chips with thumbnails during the session.
- After this phase the agent can already *talk* about an attached page ("what key is this in?"), but it writes nothing new.

Tests:
- unit, for the attachment rules and the adapter mapping;
- e2e with a mocked route: attach a PNG, the chip shows, the request is multipart with the file, and the mocked reply's commands apply.

### Phase 2: read, detect, write, check

- **`modules/page`:** the detector from `scripts/lib/notehead-detect.mts` and `scripts/lib/sheet-bars.mts`, split into domain files (staves, heads, barlines, the text listing) that work on a grayscale pixel array, and a server-only adapter (`page/server.ts`) that decodes, enlarges small pages to 28 px per staff space, and draws the labels. The evaluation scripts import it from there, so the product and the measurements share one detector.
- **`music_read_source`** (`assistant/application/source-reading-tool.ts`, schema in `music-tool-schemas.ts`), with `.describe()` text that teaches the reading. The gateway enforces the order: in a turn with attachments, a write before a reading is answered with the rule. The result carries the heads as text per picture; the labelled pictures are added to the conversation as a user message after the tool results (the API accepts images only in user messages).
- **`page_check`**: the written bars against the detected heads, as described above. Its options say which score bar the page's first bar is (a pickup written as its own bar shifts it) and which staff handle each staff of the page is (from the reading).
- **`score_write.pitches: "written"`**, converted in `score/application/score-text-write.ts` with `toConcert` for transposing parts. Unit test: a B♭ trumpet line written as on the page sounds a tone lower.
- **System prompt:** a compact "Reading music" section:
  - read (with every picture's staves), then write a part or a grand staff at a time, 8 bars a call, then `page_check` and fix;
  - use the detected heads for every note's line or space and the picture for everything else; apply the key signature to every note, accidentals lasting to the barline;
  - copy transposing parts with `pitches: "written"`;
  - a pickup becomes its own first bar, padded with rests, and is said;
  - ask where to put the music only when the score already has some.
- Destination question, when the score has music: replace, add after bar N, or add as new parts.
- Limits and unsupported notation, handled as decided; the reply lists them.
- Progress lines for reading, detecting, each chunk written, and checking.
- `MAX_TOOL_STEPS` and `maxDuration` raised for turns with attachments, to 24 steps and 600 s. A turn that runs out says how far it got, and "continue" picks up from there.

Tests:
- unit for the detector on two rendered fixture pages (staves, heads on the right line or space, barlines), the listing, and `page_check`'s differences;
- unit with a scripted model: write-before-read rejected; a reading over 32 bars yields "bars 1–32"; written pitches are converted; the labelled page follows the reading; the destination question appears only for a non-empty score;
- e2e with a mocked route: an attached page creates a two-part score through the mocked commands, and Undo restores the empty sheet.

### Phase 3: music written as text

The same read-then-write flow for text sources, with guidance per kind in the prompt and the reading tool:
- **Chord charts:** bars of chord symbols, with slash display (`shows slashes`) unless rhythm is given.
- **Lyrics with chords:** chords at the syllable they sit over, rounded to the beat; lyrics left out.
- **Note names and solfège:** the rhythm is asked for, or plain quarters with a note.
- **ABC:** a full mapping. Its header gives title, meter, key and default length; repeats map to ours.
- **Guitar tab:** fret and string become pitch (standard tuning unless stated), with rhythm from the tab's spacing or asked.

Tests: unit with a scripted model for each kind (one example each), checking the score text written. Main flows only.

### Phase 4: harder pictures

- **PDF pages through the detector:** render each page to an image in the browser (pdf.js) before sending, so the detector reads PDFs too. Until then a PDF goes to the model as a file and is read without detection.
- **Phone photos:** straighten the page (find the staff lines' angle and curvature, dewarp) and use an adaptive threshold for uneven light, then detect as usual.
- **Handwriting:** measure first; likely staves only, heads left to the model.
- **Look again:** render the imported bars server-side and give that image back to the model beside the source, if real use shows errors `page_check` misses.

## Out of scope for this plan

- Importing MusicXML or MIDI deterministically. That is a converter, not reading, and would be a separate plan.
- Audio of recorded instruments.
- Lyrics in the score.
- Keeping the source page in the project to view side by side.
- Batch import of many files into many scores.

## Risks

- **Accuracy on dense or handwritten pages.** Mitigated by the detector, reasoning first, writing in small chunks, `page_check`, and flagging unclear spots. Photos and handwriting wait for phase 4.
- **Detector noise and misses:** digits, flags and text read as heads; heads touching beams or other heads missed. Mitigated by telling the agent both happen, and by `page_check` reporting differences rather than overwriting.
- **Key signatures and accidentals:** the most common reading mistake. Mitigated by the prompt rule, checking against the reading's key, and the evaluation.
- **Multi-staff alignment** (piano right and left hand, several parts): bars drifting between parts. Mitigated by writing all of a bar range's lines in one `score_write`, and by the reading's bar count per part.
- **Time and cost:** images are resent on every model step. A 4-page PDF is about 6,000 tokens a step; prompt caching should absorb most of it, and phase 0 measures it.
- **Turn length:** a long piece needs many steps. Mitigated by chunking, progress lines, raised limits for imports, and "continue".
- **Score limits** (32 bars, 8 parts) are too small for much real music. Open question 1.
- **Privacy:** pages are sent to Meta, as takes are today. The attach control's tooltip says so.

## Open questions for the product owner

1. **Score size:** keep 32 bars, or raise it (64? 128?) before or with this plan? It affects request size, layout cost and the agent's context.
2. **Default destination** when the score has music: always ask (planned), or always open a new score?
3. **Approximations:** write triplets straight with a note (planned), or leave those bars empty and flagged?
4. **Unclear spots:** list them in the reply (planned), or also select them on the sheet so the musician can check them one by one?
5. **Test pages:** which real pages (printed, photo, handwritten, chord chart) should phase 0 use? They need to be public domain or our own.

## Starting a session

Read `AGENTS.md`, [code conventions](../architecture/code-conventions.md), this plan and the [research](../research/sheet-reading.md). Phase 0's harness stays: `yarn eval:sheet-reading --confirm --marks detected` measures the whole reading, `yarn tsx scripts/detect-eval.mts` the detector alone (free). Work phase by phase; run `yarn check` after each, and `yarn build && yarn test:e2e` before finishing one. Commit to main only when the product owner says so.
