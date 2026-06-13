# Relation type is stored relative to `fromId`; incoming relations are shown un-inverted

A `communityRelation` is directional (`from → to`) and its `type` is stated relative to the `from`
profile (`from=A, to=B, type=father` ⇒ "B is A's father"). When displaying a profile's relations we
show **outgoing** relations (subject = `from`) and **incoming** relations (subject = `to`) in two
separate sections, showing the incoming `type` **as stored** alongside the counterpart's name — we
do **not** attempt to invert the type.

We rejected building a reverse-type map (e.g. `father → child`) because the inverses are
gender-dependent and lossy: `child` inverts to `father` _or_ `mother`, `brother` to `brother` _or_
`sister`, etc. A best-effort inverse would silently mislabel relationships, which is worse than
asking the reader to read direction from the section heading. This keeps display truthful to the
single stored row and avoids encoding gender assumptions.
