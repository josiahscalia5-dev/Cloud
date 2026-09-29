# Rainbow Cascades

Android mobile game: **Slide, Bounce & Explore**. The visual target is
[`art-source/rainbow_cascades_reference.png`](art-source/rainbow_cascades_reference.png).

## Current stage: Level 1 screen (awaiting visual approval)

The **home screen** and the first **Level 1 gameplay screen** exist. Tap PLAY on the home screen
to open Level 1. No gameplay yet: this screen is for approving the look before anything else is
built on it.

The Level 1 screen is the **"Jump on the matching colors"** panel of the reference sheet
(the second panel of the top row), built at phone size:

- `preview/compare_level1_screen_vs_reference.png`: that panel next to the screen on a phone
- `preview/level1_screen_on_phone_sizes.png`: the same screen on four Android screen shapes
- `preview/level1_screen_1080x2400.png`: the raw 1080x2400 capture

What is on it, all taken from the panel's own artwork:

- **Scenery**: the floating islands, castles, rainbow waterfall, rainbow stream, gold ring, crystals,
  clouds and the four jelly blocks (purple, blue, red, green), painted as in the panel.
- **The boy** and **two pink gems** are separate layers placed exactly where the panel has them
  (so gameplay can move them); the gems float gently, and a few sparkles twinkle.
- **HUD**: pause button (top left), timer, coin counter, the "Follow the Color Sequence!" panel with
  its six orbs and "1/7", and the "Jump on the matching colors in order!" panel at the bottom. The
  panels are the painted ones with the text rebuilt as live text, so the values can change.
- **Phone shape**: the panel is 3:5 and phones are about 9:20, so a phone shows more sky between
  the colour panel and the island row. That sky continues the panel's style (castle islands cut
  from the other gameplay panels, clouds at the edges, floating confetti) instead of empty blue.
  On a 16:9 phone the screen is almost exactly the panel.

The earlier home screen files are still here: `preview/compare_home_vs_reference.png`,
`preview/preview_on_phone_sizes.png`, `preview/home_screen_1080x2400.png`.

`game/public/` is the game (HTML/CSS/JS): `index.html` is the home screen, `level1.html` the
Level 1 screen. The Android app will show it in a full-screen WebView, so what you see in Chrome
at phone size is what the app renders.

Run it locally:

```sh
cd game && npm install && npm run serve        # then open http://localhost:8080 at phone size
npm run screenshot                             # re-capture preview/home_screen_1080x2400.png
npm run screenshot:level1                      # re-capture preview/level1_screen_1080x2400.png
```

## How the artwork was produced

All artwork comes from the reference image; nothing was redrawn.

1. The home panel and the other panels were cropped and upscaled 4x with Real-ESRGAN (anime model).
2. The painted UI (top bar, title, side menu, PLAY, bottom navigation) was cut out as separate
   images so each button can be tapped, and removed from the background with LaMa inpainting.
3. The reference screen is 2:3, wider than any phone, so the background was extended upward
   with sky and clouds matched to the art, plus three floating islands taken from the other
   panels (Rainbow Gate, Platforms Rotate and Choose Your Path screens).
4. Level, XP, coins and gems are live text over rebuilt pills (Fira Sans Condensed), so they
   can show the player's real values.

`tools/art/pipeline.py` reruns all of this from the reference image
(`python tools/art/pipeline.py <work_dir>`; it downloads the models on first run).

The Level 1 screen follows the same approach with the "Jump on the matching colors" panel:
`python tools/art/build_level1_screen.py <work_dir>` (models as above in `<work_dir>/models/`)
upscales the panel, cuts out the boy, the gems and the HUD pieces, removes them and the painted
text from the scenery with LaMa, extends the sky with islands from the other gameplay panels, and
writes `game/public/assets/level1/`. `tools/art/compose_level1_preview.py` makes the comparison
sheets from screenshots taken with `game/scripts/screenshot.mjs`.
