# Icons

dash's icon, drawn on a 64 × 64 grid in the dashboard's own colours: neutral tiles and the green a running service's dot is.

- `a-tiles-theme.svg`, in use as `app/icon.svg`: a 2 × 2 grid of tiles, one of them a green status dot, without a tile behind it, dark on a light background and light on a dark one (by the device's setting). `components/brand.tsx` draws the same in the theme's colours, for the heading; keep the two alike.
- `a-tiles.svg`: the same on a dark tile, which `app/favicon.ico` and `app/apple-icon.png` are made from, as neither can follow a theme and iOS wants a solid icon.
- `b-bento.svg`: a tall tile beside two stacked ones, as sections can sit, with a dot on the tall one.
- `c-letter.svg`: a lowercase d with the dot in its bowl.

To switch, copy one to `app/icon.svg`, and make `app/favicon.ico` (16, 32 and 48 px) and `app/apple-icon.png` (180 px, without the rounded corners, which iOS adds itself) from it.

## Relay

Icons for the stream relay's tile, uploaded in its Edit tile rather than used by dash itself. Same dark tile as dash's, in the red of a live stream.

- `relay/a-fork.svg`: a red live dot whose line forks in two, one stream in and two out.
- `relay/b-broadcast.svg`: a red live dot with waves going out either side.
- `relay/c-red.svg`: the fork in white on a red tile.
- `relay/b2-grey.svg`: the waves without a tile, in a grey both themes show.
- `relay/b3-theme.svg`, the pick: the waves without a tile, dark on a light theme and light on a dark one (it follows the device's setting, not dash's theme button).
