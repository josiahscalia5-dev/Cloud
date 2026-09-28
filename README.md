# Rainbow Cascades

Android mobile game: **Slide, Bounce & Explore**. The visual target is
[`art-source/rainbow_cascades_reference.png`](art-source/rainbow_cascades_reference.png).

## Current stage: Level 1 preview (playable, awaiting approval)

The **home screen** and **Level 1** exist. Tap PLAY on the home screen to play Level 1. No other
levels or worlds yet; the other home buttons show a "not built yet" note.

**Try it on your phone:** install `preview/RainbowCascades-level1-preview.apk` (Android 7+; allow
"install unknown apps" when asked). It opens on the home screen.

**Level 1: Follow the Color Sequence** (direction: `art-source/level1_direction.png`)

- The boy starts on the red block. Each row ahead has two jelly blocks; tap the one whose colour
  comes next in the sequence (red, yellow, blue, green, purple, pink), then tap to leap into the
  Rainbow Gate. The counter shows the step (1/7 to 7/7: six colours, then the gate).
- Every colour also has its own symbol (flower, circle, triangle, club, star, heart), so the
  colours can be told apart without relying on hue.
- A wrong block wobbles, throws the boy back and drops into the clouds. If you wait, the right
  block glows and gets an arrow.
- Coins (+25) and gems (+5) float over some blocks and along the leap into the gate. Finishing
  adds +50 coins, and +100 more with no mistakes. Stars: 3 with no mistakes, 2 with one, 1 otherwise.
- The Level Complete card is the one from your reference sheet, with live rewards.
- The wallet is saved on the phone and shared with the home screen.

Files:

- `preview/compare_level1_vs_direction.png`: your Level 1 image next to the game at key moments
- `preview/level1_screen_1080x2400.png`: the level at the start, on a 1080x2400 phone
- `preview/compare_home_vs_reference.png`, `preview/preview_on_phone_sizes.png`,
  `preview/home_screen_1080x2400.png`: the home screen
- `game/public/`: the game (HTML/CSS/JS). `index.html` is the home screen, `level1.html` the level.
  The play field is real 3D (CSS perspective), so the blocks, coins and gate grow as the boy advances.
- `android/`: the app. A full-screen WebView shows `game/public`, so what you see in Chrome at
  phone size is what the app renders.

Run it locally:

```sh
cd game && npm install && npm run serve        # then open http://localhost:8080 at phone size
npm run screenshot                             # re-capture preview/home_screen_1080x2400.png
node scripts/level1_preview.mjs <out_dir>      # play Level 1 through and screenshot it
```

Build the APK (JDK 11+ and the Android SDK with `platforms;android-34` and `build-tools;35.0.0`):

```sh
ANDROID_HOME=/path/to/sdk android/build_apk.sh preview/RainbowCascades-level1-preview.apk
```

It is signed with `android/debug-preview.keystore`, a key for preview builds only (not for a
store release), so each new preview installs over the previous one.

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

Level 1 follows the same approach with `art-source/level1_direction.png`:

1. The direction image is upscaled 4x. The boy, coins, gems, the Rainbow Gate, the HUD pieces
   (avatar, stopwatch, coin, gem, pause, the six colour orbs) and the foreground flowers are cut out.
2. Everything the game draws live (HUD, blocks, boy, pickups, gate) is removed from the backdrop
   with LaMa, the path is covered with a sea of clouds, and the sky is extended for 9:20 phones.
3. The jelly blocks are generated in the painted blocks' style, with colours sampled from them:
   the painted blocks are drawn at angles that can't be unwarped into clean textures.
4. The Level Complete card, its stars and the Next Level button come from the reference sheet
   (panel 10), with the reward rows rebuilt as live text.

`tools/art/pipeline_level1.py <work_dir>` reruns the Level 1 steps and writes `game/public/assets/level1/`.
`tools/art/build_app_icon.py` makes the launcher icon from the avatar.
