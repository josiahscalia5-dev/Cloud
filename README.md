# Rainbow Cascades

Android mobile game: **Slide, Bounce & Explore**. The visual target is
[`art-source/rainbow_cascades_reference.png`](art-source/rainbow_cascades_reference.png): each
screen of the game is the matching screen of that sheet, reproduced as drawn.

## Current stage: home + Level 1 screen, exact copies (awaiting visual approval)

Two screens exist, both exact reproductions of the reference: the **home screen** (panel 1) and
the first **Level 1 screen**, "Jump on the matching colors" (panel 2). Tap PLAY on the home screen
to open Level 1. No gameplay yet.

- `preview/compare_level1_screen_vs_reference.png`, `preview/compare_home_vs_reference.png`:
  each reference screen next to the game on a phone, at the same size
- `preview/level1_screen_on_phone_sizes.png`, `preview/home_screen_on_phone_sizes.png`: the same
  screens on four Android screen shapes
- `preview/level1_screen_1080x2400.png`, `preview/home_screen_1080x2400.png`: raw captures

**Exact means:** the screen is the reference artwork itself (upscaled 4x), with its framing,
proportions, colours and HUD positions unchanged. Nothing is redrawn or added. Phones are taller
than the reference screens (about 9:20 against 3:5), so the reference screen is shown whole and
centred, and the phone shows the sheet's dark navy above and below it.

**Level 1 screen:**

- Scenery with the jelly blocks as painted. The boy and the two pink gems are separate layers on
  their painted spots, so gameplay can move them; the gems float gently.
- HUD as painted: pause button, timer and coin pills, "Follow the Color Sequence!" with its six
  orbs, and the "Jump on the matching colors in order!" panel. Only the numbers the game changes
  (timer, coins, "1/7") are live text, written where the painted digits were.
- Swipe controls (preview): swipe left or right and the boy turns his whole body that way and
  steps sideways; swipe up and he hops. The pause button pauses. Arrow keys work in a browser.

**Visual lock:** this Level 1 screen is the visual standard for the rest of Level 1.
`npm run check:level1` (in `game/`) fails if the screen at rest stops matching reference panel 2
(a 3-pixel shift of the boy or a panel is enough to fail it), if a swipe control stops working, or
if swiping changes anything on screen other than the boy.

**Home screen:** the painted panel, with the side menu, PLAY, the bottom tabs, the avatar and
the settings gear as tappable pieces over their painted twins. The level, coin and gem numbers are
live. PLAY opens Level 1; the other buttons say they are not built yet.

`game/public/` is the game (HTML/CSS/JS): `index.html` is the home screen, `level1.html` the
Level 1 screen. The Android app will show it in a full-screen WebView, so what you see in Chrome
at phone size is what the app renders.

Run it locally:

```sh
cd game && npm install && npm run serve        # then open http://localhost:8080 at phone size
npm run screenshot                             # re-capture preview/home_screen_1080x2400.png
npm run screenshot:level1                      # re-capture preview/level1_screen_1080x2400.png
npm run check:level1                           # Level 1 screen still matches the reference
```

## How the artwork was produced

All artwork comes from the reference image; nothing was redrawn.

- **Home** (`python tools/art/pipeline.py <work_dir>`; it downloads the models on first run):
  the sheet is upscaled 4x with Real-ESRGAN (anime model); the buttons, avatar and gear are cut
  out so they can be tapped (`build_home_ui.py`); the background is panel 1 as painted, and the
  level, coin and gem digits are removed from three small patches with LaMa so the game can write
  the player's numbers there (`build_home_exact.py`).
- **Level 1 screen** (`python tools/art/build_level1_screen.py <work_dir>`, models in
  `<work_dir>/models/`): panel 2 is upscaled 4x; the boy (BiRefNet), the two gems, the pause
  button and the six orbs are cut out; they, the HUD and the mockup frame are removed from the
  scenery with LaMa; the HUD panels are kept as painted, with only the timer, coin and "1/7"
  digits removed. Writes `game/public/assets/level1/`.
- **Preview sheets:** `python tools/art/compose_screen_preview.py <shots_dir> <out_dir>`, from
  screenshots taken with `game/scripts/screenshot.mjs` (see the script for the phone sizes).
