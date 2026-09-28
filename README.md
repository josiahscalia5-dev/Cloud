# Rainbow Cascades

Android mobile game: **Slide, Bounce & Explore**. The visual target is
[`art-source/rainbow_cascades_reference.png`](art-source/rainbow_cascades_reference.png); Level 1
follows [`art-source/level1_direction.png`](art-source/level1_direction.png).

## Current stage: home screen + playable Level 1

- **Home screen** (`index.html`): built to match the reference. **PLAY** starts Level 1. The
  other buttons still show "isn't built yet".
- **Level 1: Follow the Color Sequence** (`level1.html`): playable from start to finish.
  - The sequence panel shows six colors: red, yellow, blue, green, purple, pink. Each row of
    jelly blocks has the next color plus one or two other colors. Tap the right block (anywhere
    on its side of the screen) and the boy hops onto it.
  - A wrong block turns grey and bounces him back. It counts as a mistake but nothing else is
    lost, since this is the first level.
  - After the six colors come the rainbow step, two more rainbow steps and a leap into the
    Rainbow Gate, then the **Level Complete** card.
  - Coins (+10) and gems (+1) float over some of the right blocks. Finishing gives +100 coins,
    and +100 more for a perfect run.
  - Stars: 3 for no mistakes, 2 for one or two, 1 otherwise. The timer starts on the first jump.
  - Each color also has its own symbol (clover, circle, triangle, diamond, star, heart), so the
    blocks can be told apart without relying on color.
  - After 5 seconds with no tap, the right block glows and the banner says which color to tap.
  - Pause pauses the game (so does switching away from the app) and offers Resume, Restart and
    Home. **Next Level** shows "Level 2 isn't built yet".
- The wallet (coins, gems) and best results are shared between screens through `js/profile.js`
  (localStorage for now), so coins earned in Level 1 show up on the home screen.

Both pages are HTML/CSS/JS. The Android app will show them in a full-screen WebView, so what you
see in Chrome at phone size is what the app renders.

Previews:

- `preview/level1_vs_direction.png`: the direction image next to Level 1 at the same moment
- `preview/level1_play_sequence.png`: a full run (start, jump, wrong block, gate, Level Complete)
- `preview/level1_on_phone_sizes.png`: Level 1 on four Android screen shapes
- `preview/compare_home_vs_reference.png`, `preview/preview_on_phone_sizes.png`,
  `preview/home_screen_1080x2400.png`: the home screen

Run it locally:

```sh
cd game && npm install && npm run serve        # then open http://localhost:8080 at phone size
npm run screenshot                             # re-capture preview/home_screen_1080x2400.png
npm run level1                                 # play Level 1 headless, screenshots in shots/level1/
```

On a desktop browser, Level 1 also takes the arrow keys (left / up / right) and P or Esc to pause.

## How the artwork was produced

All artwork comes from the two source images; nothing was redrawn.

Home screen (`tools/art/pipeline.py <work_dir>`):

1. The home panel and the other panels were cropped and upscaled 4x with Real-ESRGAN (anime model).
2. The painted UI (top bar, title, side menu, PLAY, bottom navigation) was cut out as separate
   images so each button can be tapped, and removed from the background with LaMa inpainting.
3. The reference screen is 2:3, wider than any phone, so the background was extended upward
   with sky and clouds matched to the art, plus three floating islands taken from the other
   panels (Rainbow Gate, Platforms Rotate and Choose Your Path screens).
4. Level, XP, coins and gems are live text over rebuilt pills (Fira Sans Condensed), so they
   can show the player's real values.

Level 1 (`tools/art/pipeline_level1.py <work_dir>`):

1. The direction image is upscaled 4x with Real-ESRGAN.
2. The HUD, blocks, pickups, boy and gate are removed with LaMa (`build_level1_clean.py`). The
   path is filled with a sea of clouds, and the art is extended to 9:21 with sky above and
   foliage below (`build_level1_bg.py`). The result is upscaled 4x again.
3. The boy, coin, gems, Rainbow Gate, HUD icons, sequence orbs and a foreground bush are cut out
   (`build_level1_art.py`).
4. The green block (the only one nothing overlaps) is cut out, its clover removed, and recolored
   into the six sequence colors, a rainbow block and a grey one, each with its own symbol
   (`build_level1_platforms.py`).
5. The Level Complete card comes from reference panel 10. Its stars, rewards table and Next Level
   button are lifted off so the stars can animate and the rewards show real numbers
   (`build_level1_complete.py`).

Both pipelines download their models on first run (Real-ESRGAN anime 4x, LaMa, BiRefNet) and need
`pip install torch onnxruntime opencv-python-headless pillow numpy scipy`.
