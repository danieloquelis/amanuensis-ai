import { test } from "node:test";
import assert from "node:assert/strict";
import { createPlaybackPlan, scoreToMidi } from "@/modules/playback";
import {
  createExample,
  createSession,
  execute,
  scoreToMusicXml,
  writeBars,
  type InstrumentId,
  type Score,
} from "@/modules/score";

/** The example song (C major) with a trumpet and drums, and a few bars written in. */
function band(): Score {
  let session = createSession(createExample());
  for (const instrument of ["trumpet", "drums"] as InstrumentId[]) {
    session = execute(session, {
      requestId: `add-${instrument}`,
      expectedRevision: session.score.revision,
      operation: { type: "addPart", instrument },
    });
  }
  const text = [
    "bar 1 trumpet: C4q 3[D4e E4e F4e] G4h~ ; chords Cmaj7",
    "bar 2 trumpet: G4w",
    "bar 1 drums: <hat>q <hat snare>q <hat>q <hat snare>q",
    "bar 1 drums v2: <kick>h <kick>h",
  ].join("\n");
  return execute(session, writeBars(session.score, text, "bars", "concert", { keepHarmony: true }).command).score;
}

test("MusicXML holds every part as its player reads it, with its rhythm, ties, chords and drums", () => {
  const xml = scoreToMusicXml(band());
  assert.match(xml, /<score-partwise version="4\.0">/);
  assert.equal((xml.match(/<score-part id=/g) ?? []).length, 3);
  assert.equal((xml.match(/<part id=/g) ?? []).length, 3);
  // The B♭ trumpet is written a tone above its sound, and says so; its key is D major.
  const trumpet = xml.slice(xml.indexOf('<part id="P2">'), xml.indexOf('<part id="P3">'));
  assert.match(trumpet, /<transpose><diatonic>-1<\/diatonic><chromatic>-2<\/chromatic><\/transpose>/);
  assert.match(trumpet, /<key><fifths>2<\/fifths>/);
  assert.match(trumpet, /<pitch><step>D<\/step><octave>4<\/octave><\/pitch><duration>24<\/duration>/);
  // A triplet of eighths: three notes in the time of two, bracketed; a tie across the barline.
  assert.equal((trumpet.match(/<actual-notes>3<\/actual-notes>/g) ?? []).length, 3);
  assert.match(trumpet, /<tuplet type="start"\/>/);
  assert.match(trumpet, /<tie type="start"\/>/);
  assert.match(trumpet, /<tie type="stop"\/>/);
  // Chord symbols on the first part; drums as unpitched notes, cymbals with x heads.
  assert.match(xml, /<harmony><root><root-step>C<\/root-step><\/root><kind text="maj7">major-seventh<\/kind>/);
  const drums = xml.slice(xml.indexOf('<part id="P3">'));
  assert.match(drums, /<sign>percussion<\/sign>/);
  assert.match(
    drums,
    /<unpitched><display-step>G<\/display-step><display-octave>5<\/display-octave><\/unpitched>.*?<notehead>x<\/notehead>/,
  );
});

/** A MIDI file's note-ons, by channel: [channel, note] for each. */
function noteOns(file: Uint8Array): [number, number][] {
  const found: [number, number][] = [];
  let at = 14;
  while (at < file.length) {
    const end = at + 8 + ((file[at + 4] << 24) | (file[at + 5] << 16) | (file[at + 6] << 8) | file[at + 7]);
    let i = at + 8;
    while (i < end) {
      while (file[i] & 0x80) i++;
      i++;
      const status = file[i];
      if (status === 0xff) {
        i += 2;
        let length = 0;
        while (file[i] & 0x80) length = (length << 7) | (file[i++] & 0x7f);
        length = (length << 7) | file[i++];
        i += length;
      } else if ((status & 0xf0) === 0xc0) i += 2;
      else {
        if ((status & 0xf0) === 0x90) found.push([status & 0x0f, file[i + 1]]);
        i += 3;
      }
    }
    at = end;
  }
  return found;
}

test("MIDI plays every note the app plays, one track per part, the drums on channel 10", () => {
  const score = band();
  const file = scoreToMidi(score);
  assert.equal(new TextDecoder().decode(file.slice(0, 4)), "MThd");
  // A conductor track, then one per part.
  assert.equal((file[10] << 8) | file[11], score.parts.length + 1);
  const plan = createPlaybackPlan(score);
  const ons = noteOns(file);
  assert.equal(
    ons.length,
    plan.events.reduce((sum, event) => sum + event.notes.length, 0),
  );
  // The kick (General MIDI 36) on the percussion channel; the trumpet's concert C4 (60) elsewhere.
  assert.ok(ons.some(([channel, note]) => channel === 9 && note === 36));
  assert.ok(ons.some(([channel, note]) => channel !== 9 && note === 60));
});
