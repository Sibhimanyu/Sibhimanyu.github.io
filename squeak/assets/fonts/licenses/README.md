# Bundled fonts

All three families are licensed under the SIL Open Font License 1.1. License texts sit beside the fonts. Fetched 2026-10-19; every URL below returned HTTP 200.

| Family | Weights bundled | PostScript names | Source | License |
|---|---|---|---|---|
| Figtree | 400, 500, 600, 700 | Figtree-Regular, Figtree-Medium, Figtree-SemiBold, Figtree-Bold | https://github.com/erikdkennedy/figtree · https://github.com/google/fonts/tree/main/ofl/figtree | `Figtree/OFL.txt` (https://raw.githubusercontent.com/google/fonts/main/ofl/figtree/OFL.txt) |
| Inter | Regular, Medium, SemiBold, Bold | Inter-Regular, Inter-Medium, Inter-SemiBold, Inter-Bold | https://rsms.me/inter/ | `Inter/LICENSE.txt` (https://github.com/rsms/inter/blob/master/LICENSE.txt) |
| JetBrains Mono | Regular, Medium | JetBrainsMono-Regular, JetBrainsMono-Medium | https://www.jetbrains.com/lp/mono/ | `JetBrainsMono/OFL.txt` (https://github.com/JetBrains/JetBrainsMono/blob/master/OFL.txt) |

Notes
- `Inter-Bold.otf` (weight 700) was added so the document's Inter 700 resolves to `Inter-Bold`.
- Files are copied unmodified from `~/Library/Fonts`. Figtree files are named by weight (`Figtree-400.ttf`); the PostScript names inside are the ones above.
- `~/Library/Fonts` also holds a second JetBrains Mono set (`JetBrainsMono-400/500/600.ttf`, v2.211) with the same PostScript names as the bundled v2.304 `Regular`/`Medium`. Illustrator may pick either copy. Remove the older set if it picks the wrong one.
- The Inter license download is the project's `LICENSE.txt` (an OFL 1.1 text with the Inter copyright line).
- Figtree's name tables carry no embedded license string; the OFL file is the license of record.
