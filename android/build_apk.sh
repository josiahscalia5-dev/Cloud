#!/usr/bin/env bash
# Builds the Rainbow Cascades preview APK without Gradle: the game pages in game/public are
# bundled as assets and shown full screen by a WebView (src/.../MainActivity.java).
#
#   ANDROID_HOME=/path/to/sdk android/build_apk.sh [out.apk]
#
# Needs a JDK (11+) and, in the SDK, platforms;android-34 and build-tools;35.0.0
# (the d8 in build-tools 34 crashes on this app's anonymous classes).
# Signed with debug-preview.keystore so every preview build can update the previous one.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/opt/android-sdk}}"
BT="$SDK/build-tools/35.0.0"
JAR="$SDK/platforms/android-34/android.jar"
OUT="${1:-$ROOT/android/build/RainbowCascades.apk}"
VERSION_CODE="${VERSION_CODE:-1}"
VERSION_NAME="${VERSION_NAME:-0.2-level1}"
B="$HERE/build"

rm -rf "$B/gen" "$B/obj" "$B/dex" "$B/res" "$B/assets"
mkdir -p "$B/gen" "$B/obj" "$B/dex" "$B/res" "$B/assets/www" "$(dirname "$OUT")"

# game pages -> assets/www
cp -R "$ROOT/game/public/." "$B/assets/www/"

"$BT/aapt2" compile --dir "$HERE/res" -o "$B/res/res.zip"
"$BT/aapt2" link -o "$B/unsigned.apk" -I "$JAR" --manifest "$HERE/AndroidManifest.xml" \
  -R "$B/res/res.zip" -A "$B/assets" --java "$B/gen" --auto-add-overlay \
  --min-sdk-version 24 --target-sdk-version 34 \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" -0 webp -0 woff2

javac -nowarn --release 8 -classpath "$JAR" -d "$B/obj" \
  $(find "$HERE/src" "$B/gen" -name '*.java')
(cd "$B/obj" && jar cf "$B/classes.jar" .)
"$BT/d8" --release --min-api 24 --lib "$JAR" --output "$B/dex" "$B/classes.jar"
(cd "$B/dex" && zip -q -j "$B/unsigned.apk" classes.dex)

"$BT/zipalign" -f -p 4 "$B/unsigned.apk" "$B/aligned.apk"
KS="$HERE/debug-preview.keystore"
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -storepass rcpreview -keypass rcpreview -alias preview \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Rainbow Cascades Preview" >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:rcpreview --key-pass pass:rcpreview --ks-key-alias preview \
  --out "$OUT" "$B/aligned.apk"
"$BT/apksigner" verify "$OUT"
echo "built $OUT ($(du -h "$OUT" | cut -f1))"
