# Rainbow Cascades

Android mobile game: **Slide, Bounce & Explore**. The visual target is
[`art-source/rainbow_cascades_reference.png`](art-source/rainbow_cascades_reference.png).

## Current stage: home screen preview (awaiting approval)

Only the Rainbow Cascades **home screen** exists so far, built to be compared with the
reference before any gameplay is written. No levels, gameplay or other worlds yet.

- `preview/compare_home_vs_reference.png`: the reference panel next to the phone preview
- `preview/preview_on_phone_sizes.png`: the same screen on four Android screen shapes
- `preview/home_screen_1080x2400.png`: the raw 1080x2400 capture
- `game/public/`: the screen itself (HTML/CSS/JS). The Android app will show this page in a
  full-screen WebView, so what you see in Chrome at phone size is what the app renders.

Run it locally:

```sh
cd game && npm install && npm run serve        # then open http://localhost:8080 at phone size
npm run screenshot                             # re-capture preview/home_screen_1080x2400.png
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
