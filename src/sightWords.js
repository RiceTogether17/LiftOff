/**
 * High-frequency "Look and Say" sight words. These are read by sight, not
 * blended, so Sound It Out shows them as whole words (CDM: "many of these
 * words do not sound like their spelling might suggest").
 *
 * The first block is the WorkBook sight-word homework list shown in the
 * CDM; the second adds common irregular words from the LiftOff spelling
 * lists. A word is only treated as a sight word when the story prints it
 * without coding — coded words are meant to be decoded.
 */
export const SIGHT_WORDS = new Set(
  `a about above again all also are be came day do does for go he her his how
   i in into is it know many name not now of on one over said she so some story
   the their then there this to too want was were what when white
   until young you who give mother brother something become wolf
   they your have come done gone could would should other any once two four
   where why here my me we no our out by from with has had as an at if or
   put push pull full very every only more most because people water words`
    .split(/\s+/)
    .filter(Boolean),
);

export const isSightWord = (w) => SIGHT_WORDS.has(w.toLowerCase());
