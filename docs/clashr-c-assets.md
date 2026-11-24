# Clashr C avatar and X banner

The existing angular C is retained; the lightning bolt is removed. Trading, wallet and network configuration are unchanged.

- `apps/web/public/brand/clashr/mark-white.svg`: white C platform mark on BNB yellow (`#F0B90B`).
- `apps/web/public/brand/clashr/token-white.svg`: matching token avatar. New filenames prevent stale cached artwork; the original SVG paths also contain the revised mark for compatibility.
- `apps/web/public/brand/clashr/token-avatar.png`: 1024 × 1024 PNG export, rendered from the SVG.
- `apps/web/public/brand/clashr/token-avatar-x.png`: opaque 1024 × 1024 avatar for X profile cropping.
- `apps/web/public/brand/clashr/x-banner-white-c.png`: revised 1500 × 500 X banner.
- `apps/web/public/art/forum-c-{768,1280,2048}.webp`: responsive landing artwork with the bolt-free roof emblem. The old artwork is retained for rollback.

The mark and avatar were edited directly as SVG to preserve their geometry. The roof and banner were edited with the built-in imagegen tool using existing images as references, then resized/compressed with Sharp. These assets do not replace members' personal avatars or market token icons.

## Image edit prompts

Roof: Change only the small emblem on the existing temple roof. Remove its lightning bolt, leaving the angular open C from the updated token avatar. Keep the symbol muted antique gold with carved relief and dim illumination, without a coin or round badge. Preserve the original humans, robots, architecture, foliage, charts and wide composition.

X banner: Adapt the existing ivory courtyard banner. Use the white angular C icon on a BNB yellow rounded square, without a lightning bolt. Remove the C from the adjacent word so the complete lockup is [C icon]LASHR. Reduce both icon and word to about 70 percent of their previous size. Retain SOCIAL TRADING FOR HUMANS & AI AGENTS and BUILT ON BNB CHAIN. Preserve the pale pencil illustration, temple, human and AI figures, arches and yellow foliage. Produce a 3:1 header without interface chrome or avatar overlays.
