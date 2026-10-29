# Instrument sounds

Verified on 29 October 2026 with HEAD requests and the repositories' READMEs. The decisions that follow from this research are in the [instruments and voices plan](../planning/instruments-voices-plan.md).

| Source | What | License | Size (measured) | Self-host |
| --- | --- | --- | --- | --- |
| **Splendid Grand Piano** (`smpldsnds/sfzinstruments-splendid-grand-piano`, smplr `SplendidGrandPiano`) | Steinway, AKAI, 4–5 velocity layers, 303 samples per format | **Public domain** (released by AKAI; listed as Public Domain by sfzinstruments) | about 19.9 MB `.ogg` (Opus) and about 23.8 MB `.m4a` (AAC) for the full set; 60–70 KB per sample | yes: preset `baseUrl` |
| **FluidR3_GM** via `gleitz/midi-js-soundfonts` (smplr `Soundfont`, `kit: "FluidR3_GM"`) | GM instruments as base64 `-mp3.js`, one file per instrument, 88 notes | gleitz states **CC BY 3.0**. Upstream Fluid R3 by Frank Wen is **MIT** (Debian copyright). Either way, attribution satisfies it. | `acoustic_guitar_nylon` 1.84 MB, `acoustic_guitar_steel` 1.98 MB, `trumpet` 2.94 MB, `flute` 2.97 MB, `trombone` 2.62 MB, `acoustic_grand_piano` 2.63 MB | yes: `instrumentUrl`. CORS is `*`. |
| MusyngKite (same repository) | Heavier, nicer GM set | **CC BY-SA 3.0** | about 2–2.9 MB per instrument | yes |
| `tonejs-instruments` | 19 instruments (no drums), mp3/ogg per note | code MIT, samples "CC-BY 3.0" from "various public domain sources" | not stated | yes |
| Salamander Grand Piano | Yamaha C5, 16 velocity layers | CC BY 3.0 (Alexander Holm) | 394 MB+ | yes |
| **VCSL** (`sgossner/VCSL`, converted to ogg/m4a at `smpldsnds/sgossner-vcsl`) | Kick (Bass Drum 1–3), snares (Modern 1–3, with round-robins), toms, Hi-Hat Cymbal (closed, open, loose, hit layers), suspended and clash cymbals, plus a Steinway B and Kawai grand | **CC0 1.0** | the full library is about 680 MB+. One-shots are 40–1000 KB each as WAV, smaller as Opus. | yes |
| smplr `DrumMachine` (`smpldsnds/drum-machines`) | TR-808, LM-2, Casio RZ-1 and others | README: "public domain samples". There is no LICENSE file. | small | yes |
| DrumGizmo DRS / Muldjord kits | Acoustic multi-mic kits | CC BY 4.0 | 347–754 MB | needs a mixdown |
| Salamander Drumkit | Acoustic kit | CC BY-SA 3.0 | about 370 MB | yes |

There is no GM drum kit (channel 10) in `midi-js-soundfonts`: `FluidR3_GM/percussion-mp3.js` returns 404.

## What the app uses

- **Piano** (phase A1, implemented): Splendid Grand Piano, two velocity layers (`PP` for pp–mp, `Mf` for mf–ff) with one sample every minor third, so a played note is at most a semitone from its sample. Opus and AAC: 116 files, 11.4 MB. The full two-layer set at every sample root would be about 16 MB.
- **Guitar, trumpet, flute, trombone** (phase A2, implemented): FluidR3_GM `-mp3.js` (nylon guitar), 10.4 MB for the four; 21.7 MB with the piano.
- **Drums** (phase F): a small kit of VCSL CC0 one-shots.
- **Hosting**: served from `public/sounds/v1/` but not kept in git. The committed `manifest.json` (URL, size, sha256) drives `yarn sounds:fetch`, which runs after `yarn install` and before `yarn build`.
- **Budget**: 25 MB for every sample set together, enforced by `tests/integration/sounds.integration-test.ts`.
- **Format note**: Playwright's bundled Chromium has no proprietary codecs (AAC), so Opus is served as well; smplr picks the first format the browser can play.

Sources: [smplr README](https://github.com/danigb/smplr), [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts), [sfzinstruments pianos](https://sfzinstruments.github.io/pianos), [sfzinstruments drums](https://sfzinstruments.github.io/drums), [Splendid Grand Piano mirror](https://github.com/smpldsnds/sfzinstruments-splendid-grand-piano), [VCSL](https://github.com/sgossner/VCSL), [VCSL ogg/m4a mirror](https://github.com/smpldsnds/sgossner-vcsl), [tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments), [drum-machines](https://github.com/smpldsnds/drum-machines), [Fluid R3 license (Debian)](https://sources.debian.org/copyright/license/fluidr3mono-gm-soundfont/2.315-7), [Salamander Grand Piano](https://github.com/sfzinstruments/SalamanderGrandPiano).
