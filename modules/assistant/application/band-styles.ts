import { z } from "zod";

/**
 * The style families the band plays in. Each brings how a professional in that style writes:
 * the idiom every musician reads, and whether the rules of counterpoint bind.
 */
export const STYLES = ["baroque", "classical", "cinematic", "jazz", "latin", "pop"] as const;
export type Style = (typeof STYLES)[number];

export const styleSchema = z
  .enum(STYLES)
  .describe(
    "baroque: fugue, canon, invention, chorale, concerto. classical: string quartet, sonata, minuet, chamber music. cinematic: film, romantic, orchestral, epic builds, strings and piano ballads. jazz: swing, ballad, bebop, jazz waltz, bossa. latin: salsa, son, samba, tango, cumbia. pop: pop, rock, soul, funk, R&B, folk, country.",
  );

type StyleCard = { idiom: string; counterpoint: boolean };

const CARDS: Record<Style, StyleCard> = {
  baroque: {
    counterpoint: true,
    idiom:
      "Baroque counterpoint. Every voice is a melody of equal weight, grown from the subject and countersubject: state them whole at your entries, then develop them (sequences, fragments, inversion, stretto) in the episodes. Rhythms stay independent: at every moment at least one voice runs in eighths or sixteenths (the motor rhythm) while another holds or moves in quarters; the subject has a rhythmic profile (a dotted figure, a run of sixteenths, a held note); the voices never all move in one rhythm. Strong beats sound consonances (3rds, 6ths, 5ths, octaves); dissonances pass by step, turn as neighbours, or are prepared suspensions resolving down by step. No parallel fifths or octaves; move against the bass in contrary motion. Episodes modulate by sequence to related keys (relative major, dominant) and come home for the last entries; each section closes with a cadence. Dynamics are terraced by section (forte for entries and the end, piano for episodes). Violins stay mostly below D6; a double bass doubles the cello's bass line an octave lower (the continuo) rather than taking fast entries of its own. No drums, no jazz walking, no comping.",
  },
  classical: {
    counterpoint: true,
    idiom:
      "Classical chamber style. A singing melody over a clear accompaniment: phrases of 4 + 4 bars ending in half and perfect cadences, the melody passed between instruments when a phrase returns, short motifs answered across the parts. Inner parts accompany with purpose and motion (Alberti or broken-chord eighths, repeated-note eighths, sustained 3rds and 6ths, a countermelody when the melody holds); the melody mixes dotted figures, eighth-note turns and scale runs into cadences with longer notes; the bass gives the harmony its root on the strong beats and moves by step between. Voice leading is strict: no parallel fifths or octaves, the leading tone rises to the tonic, sevenths fall. Dynamics in contrasts (p and f, sf accents, cresc. into a cadence).",
  },
  cinematic: {
    counterpoint: false,
    idiom:
      "Cinematic, romantic orchestral writing. One long arc: start sparse (a single line or a held chord, pp), add layers, register and rhythmic drive as it builds, reach the climax with the full range and ff, then release. A short, memorable motif carries it and comes back changed: augmented, in new instruments, over new harmony. Rich harmony: suspensions, added notes, pedal points under moving chords, modal turns (♭VI, ♭VII). Texture builds with an ostinato in eighths or sixteenths (a repeated figure in the inner strings or piano, growing busier towards the climax) under long legato lines; the bass moves slowly; the melody has a rhythmic signature (a dotted pickup, a triplet turn). Every phrase is shaped with cresc. and dim.; doublings in octaves are welcome at the climax.",
  },
  jazz: {
    counterpoint: false,
    idiom:
      "Jazz. Swing eighths unless the style is straight (ballad, bossa). Extended harmony (7ths, 9ths, 13ths); guide tones (3rds and 7ths) lead smoothly from chord to chord. The melody is phrased like a singer, with space: eighth-note pickups, anticipations (a note on the and of 4 tied over the barline), triplet turns, long notes at the ends of phrases; answers and fills go in its rests, never over it. Piano comps rootless voicings in short rhythmic stabs (off-beats, anticipations); bass walks quarter notes (chord tones on 1 and 3, chromatic approaches into each new chord) or plays a two-feel in ballads; drums keep the ride pattern with the hi-hat on 2 and 4, brushes in ballads, and set up the band's hits. Dynamics breathe; build to a shout or a peak before the head returns.",
  },
  latin: {
    counterpoint: false,
    idiom:
      "Latin. Everything locks to the clave or the style's groove (son clave 2-3 or 3-2 in salsa; the bossa and samba patterns). Piano plays montunos: syncopated two-bar patterns in octaves and chord tones; the bass plays the anticipated tumbao (on the and of 2 and on 4) in salsa, root and fifth in bossa; horns play punchy riffs and mambo lines in unison or harmony; the drums play the style's pattern. Sections build by layering riffs; breaks and hits are played by the whole band together.",
  },
  pop: {
    counterpoint: false,
    idiom:
      "Pop and rock songwriting. Song form (verse, pre-chorus, chorus, bridge) with the chorus as the peak and a hook that comes back. Rhythm drives it: eighth-note piano or guitar figures, pushes (chord changes anticipated on the and of 4), a melody with syncopation and pickups rather than square quarters. The bass locks with the kick: roots, octaves and passing notes into each chord change. Keys and guitars play the groove's rhythm with clear voicings (nothing muddy below C3). Horns and strings add pads, counter-lines and hits that answer the lead, never cover it. Build by sections: thinner verses, fuller choruses, a drop before the last chorus; dynamics follow the sections.",
  },
};

/** How a style is written, for the musicians. */
export const styleIdiom = (style: Style) => CARDS[style].idiom;
/** Whether the style keeps the rules of counterpoint (no parallel fifths, independent rhythms). */
export const keepsCounterpoint = (style: Style) => CARDS[style].counterpoint;

/** A style read from the feel, when the bandleader names none (a later turn's comments). */
export function styleFromFeel(feel: string): Style {
  if (/fugue|canon|invention|chorale|baroque|bach|concerto grosso|counterpoint/i.test(feel)) return "baroque";
  if (/quartet|sonata|minuet|classical|mozart|haydn|chamber|serenade/i.test(feel)) return "classical";
  if (/film|cinematic|epic|orchestral|romantic|score|soundtrack/i.test(feel)) return "cinematic";
  if (/salsa|son\b|samba|tango|cumbia|mambo|latin|montuno|clave/i.test(feel)) return "latin";
  if (/jazz|swing|bebop|bossa|ballad|blues/i.test(feel)) return "jazz";
  return "pop";
}
