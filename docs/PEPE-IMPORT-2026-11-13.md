# Pepe import — 2026-11-13

Downloaded from the owner logged-in Emoji.gg browser session for personal/local evaluation. No public/commercial redistribution license inferred. Full provenance is in the registry. Original ZIP files are retained in the ignored local inbox.

Downloaded **25 ZIP packs / 505 emoji**, 21,952,060 bytes. Imported **23 full packs / 463 emoji entries**, including 179 animated entries and 171 distinct image hashes.

New image files: **17,101,707 bytes** (16.31 MiB). Registry growth: 186,198 bytes. Image totals exclude ZIP copies, staging files, registry and migration text. Several community packs overlap; distinct hashes are reported separately from selectable entries.

| Pack | Emoji | Image bytes | Source |
| --- | ---: | ---: | --- |
| Pepe Classic | 31 | 1,111,450 | [Emoji.gg](https://emoji.gg/pack/195211-pepe) |
| Pepe Collection | 32 | 1,191,086 | [Emoji.gg](https://emoji.gg/pack/248040-premium-pepe-collection-vol-1) |
| Pepe · garbi_37 | 30 | 1,286,359 | [Emoji.gg](https://emoji.gg/pack/312867-pepe) |
| Pepe · khokho | 21 | 405,023 | [Emoji.gg](https://emoji.gg/pack/681621-khokho-pepe) |
| Pepe · LarssonBaBY♛ | 18 | 1,000,763 | [Emoji.gg](https://emoji.gg/pack/149567-pepe) |
| Pepe · 🔥《Rishab》🔥 | 8 | 188,492 | [Emoji.gg](https://emoji.gg/pack/889455-pepe) |
| Pepe · Raveonette | 32 | 1,633,900 | [Emoji.gg](https://emoji.gg/pack/669237-pepes) |
| Pepe · PixelJomi | 30 | 826,775 | [Emoji.gg](https://emoji.gg/pack/575735-pepe) |
| Pepe HC | 28 | 996,123 | [Emoji.gg](https://emoji.gg/pack/158770-pepehc) |
| Pepe Starter | 30 | 955,405 | [Emoji.gg](https://emoji.gg/pack/416758-pepestarterforserver) |
| Pepe · cheetos | 28 | 949,588 | [Emoji.gg](https://emoji.gg/pack/38617-pepe) |
| Pepe · __so__ | 10 | 154,115 | [Emoji.gg](https://emoji.gg/pack/419313-pepe) |
| Pepe · Ethan_S | 24 | 570,862 | [Emoji.gg](https://emoji.gg/pack/236069-pepe) |
| Pepe · Waylon | 6 | 139,486 | [Emoji.gg](https://emoji.gg/pack/896989-pepe) |
| Pepe · Mouad Ft | 14 | 468,392 | [Emoji.gg](https://emoji.gg/pack/983085-pepe) |
| Ze Frog | 7 | 148,872 | [Emoji.gg](https://emoji.gg/pack/980623-ze-frog-es-le-pepe) |
| Pepe · Sepi_2013 | 6 | 210,733 | [Emoji.gg](https://emoji.gg/pack/829461-pepe) |
| Pepe · Neri For Case | 24 | 796,338 | [Emoji.gg](https://emoji.gg/pack/281595-pepe) |
| Absolute Pepe | 17 | 636,516 | [Emoji.gg](https://emoji.gg/pack/827352-absolute-pepe) |
| Pepe · Gojo | 16 | 832,203 | [Emoji.gg](https://emoji.gg/pack/937900-pepe) |
| Pepe · jaharas | 12 | 592,837 | [Emoji.gg](https://emoji.gg/pack/25781-pepe) |
| Pepe · piperh__ | 19 | 1,066,161 | [Emoji.gg](https://emoji.gg/pack/232289-pepe) |
| El Pepe | 20 | 940,228 | [Emoji.gg](https://emoji.gg/pack/703274-el-pepe) |

Two packs were downloaded but not imported: `607784-pepe` (24 emoji; one GIF has 158 frames) and `646233-my-pepe` (18 emoji; one GIF has 144 frames). Nothing from those packs was partially imported.

Normalization resized/re-encoded 32 oversized images across installed packs; it retained every emoji and all animation frames. Duplicate GIF frames are explicitly preserved. Native Unicode catalog, old pack IDs and existing assets are unchanged. Pack tabs scroll horizontally when many packs are installed.

No commit, push, live database migration or deployment was performed.

Local verification: 55/55 unit tests, 16/16 Edge chat tests against a disposable database, TypeScript and production build passed. Nine existing emoji/reaction browser cases passed; the new imported-pack case passed after its search was scoped to a unique pack keyword (community packs reuse emoji names). The new case checks desktop/mobile tab scrolling, viewport fit, sending and reactions between two browser contexts. Rendered screenshots at 1280px and 390px were visually inspected in `coverage/manual/2026-11-13-pepe/`.

Catalog migrations were executed only in that disposable test database, never against the live Supabase project.
