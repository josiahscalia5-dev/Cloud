# Rainbow Cascades

Android mobile game: **Slide, Bounce & Explore**. The visual target is
[`art-source/rainbow_cascades_reference.png`](art-source/rainbow_cascades_reference.png).

## Current stage: Level 1 preview (playable, awaiting approval)

The **home screen** and **Level 1** exist. Tap PLAY on the home screen to play Level 1. No other
levels or worlds yet; the other home buttons show a "not built yet" note.

**Try it on your phone:** install `preview/RainbowCascades-level1-preview.apk` (Android 7+; allow
"install unknown apps" when asked). It opens on the home screen.

**Level 1** is one continuous course through the floating rainbow world, from the first red block
to the Rainbow Gate, built from `art-source/level1_direction.png` and panels 2-10 of the reference
sheet. Tap the block to jump to. Seven stages, shown as "1/7" to "7/7" in the top panel:

1. **Follow the Color Sequence**: each row has two blocks; hop onto the next colour (red, yellow,
   blue, green, purple, pink). Each colour also has its own symbol (flower, circle, triangle, club,
   star, heart), so the colours can be told apart without relying on hue.
2. **Platforms Rotate**: blocks flip over; jump while they are flat. Golden rings give tokens.
   A shimmering rainbow block off to the left starts the **secret rainbow route**, a run of rainbow
   tiles with rings and gems that rejoins the path.
3. **Moving Platforms**: blocks slide from side to side; jump as they slow down.
4. **Watch for Fake Platforms**: a dark purple zone under a laser orb; the cracked, flickering block
   of each pair crumbles.
5. **Dodge the Cloud**: the cloud monster follows you down the rainbow road and strikes a flashing
   block (and the one you stand on if you wait too long).
6. **Choose Your Path**: the blue route is safe; the gold route has more coins and gems, a sliding
   block and a fake one.
7. **Reach the Rainbow Gate**: the rainbow road, then tap to leap into the gate.

Falling, crumbling or being struck costs one of three hearts; with none left the stage starts
over. A wrong colour in stage 1 bounces you back. If you wait, the right block glows and gets an
arrow. The bar under the top panel shows how far the gate is. The Level Complete card is the one
from the reference sheet with live rewards: coins, gems, tokens (rings), the perfect bonus (no
hearts lost, no wrong colours) and the secret discovery. Stars: 3 with no faults, 2 with up to
two, 1 otherwise. The wallet is saved on the phone and shared with the home screen.

Files:

- `preview/compare_level1_stages_vs_reference.png`: each panel of your reference sheet above the
  same moment in the game, in the order the level plays
- `preview/compare_level1_vs_direction.png`: your Level 1 image next to the opening of the level
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
node scripts/level1_preview.mjs <out_dir>      # a bot plays all of Level 1 and screenshots each stage
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
   the painted blocks are drawn at angles that can't be unwarped into clean textures. The later
   stages add dark stone blocks (with a cracked twin), gold and ice path blocks and rainbow road.
4. The Level Complete card, its stars and the Next Level button come from the reference sheet
   (panel 10), with the reward rows rebuilt as live text.
5. The cloud monster, laser orb, golden ring, floating islands, stage icons and the running boy
   of the secret route are cut from panels 3-9 of the reference sheet.

`tools/art/pipeline_level1.py <work_dir>` reruns the Level 1 steps and writes `game/public/assets/level1/`.
`tools/art/build_app_icon.py` makes the launcher icon from the avatar.
