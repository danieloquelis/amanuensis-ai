import { test } from "node:test";
import assert from "node:assert/strict";
import { findTempoMarking, parseChordSymbol, rankKeysForChords, tempoMarkingFor } from "@/modules/score";

const progression = (text: string) => text.split(" ").map((symbol) => parseChordSymbol(symbol)!);

test("Em A D G is heard in D major: every chord is in D and A → D resolves", () => {
  assert.equal(rankKeysForChords(progression("Em A D G"))[0].name, "D major");
});

test("a minor progression with a major dominant reads as minor", () => {
  assert.equal(rankKeysForChords(progression("Am Dm E7 Am"))[0].name, "A minor");
});

test("a ii–V–I lands on its I", () => {
  const [best] = rankKeysForChords(progression("Dm7 G7 Cmaj7"));
  assert.equal(best.name, "C major");
  assert.ok(best.evidence.some((reason) => reason.includes("V → I")));
});

test("a tempo word is found inside a phrase, ignoring case and accents", () => {
  assert.equal(findTempoMarking("un poco ALLEGRETTO, please")?.name, "Allegretto");
  assert.equal(findTempoMarking("make it faster"), null);
});

test("a tempo is described by the narrowest marking that holds it", () => {
  assert.equal(tempoMarkingFor(132).name, "Allegro");
  assert.equal(tempoMarkingFor(70).name, "Adagio");
});
