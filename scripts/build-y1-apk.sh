#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/Users/miquelcabezas/Library/Android/sdk}}"
BUILD_TOOLS="${ANDROID_BUILD_TOOLS:-$ANDROID_SDK/build-tools/36.1.0}"
PLATFORM_JAR="$ANDROID_SDK/platforms/android-35/android.jar"

GRADLE_CACHE="${GRADLE_USER_HOME:-$HOME/.gradle}/caches/modules-2/files-2.1"
KOTLIN_COMPILER="$GRADLE_CACHE/org.jetbrains.kotlin/kotlin-compiler-embeddable/2.1.20/4ef56b3316798316bfac7a0ae443391c9e900ea1/kotlin-compiler-embeddable-2.1.20.jar"
KOTLIN_STDLIB="$GRADLE_CACHE/org.jetbrains.kotlin/kotlin-stdlib/2.1.20/aa8ca79cd50578314f6d1180c47cbe14c0fee567/kotlin-stdlib-2.1.20.jar"
KOTLIN_REFLECT="$GRADLE_CACHE/org.jetbrains.kotlin/kotlin-reflect/2.1.20/3c1003045c4f2a72f987a147abac8e7058be1183/kotlin-reflect-2.1.20.jar"
KOTLIN_SCRIPT="$GRADLE_CACHE/org.jetbrains.kotlin/kotlin-script-runtime/2.1.20/f7c623d7f7bdb01f5ccd6b437bc0a937fcd7c57e/kotlin-script-runtime-2.1.20.jar"
KOTLIN_DAEMON="$GRADLE_CACHE/org.jetbrains.kotlin/kotlin-daemon-embeddable/2.1.20/95670fce77befd02a70a0bc3abe8ee4533521334/kotlin-daemon-embeddable-2.1.20.jar"
KOTLIN_COROUTINES="$GRADLE_CACHE/org.jetbrains.kotlinx/kotlinx-coroutines-core-jvm/1.9.0/9beade4c1c1569e4f36cbd2c37e02e3e41502601/kotlinx-coroutines-core-jvm-1.9.0.jar"
JETBRAINS_ANNOTATIONS="$GRADLE_CACHE/org.jetbrains/annotations/23.0.0/8cc20c07506ec18e0834947b84a864bfc094484e/annotations-23.0.0.jar"
TROVE4J="$GRADLE_CACHE/org.jetbrains.intellij.deps/trove4j/1.0.20200330/3afb14d5f9ceb459d724e907a21145e8ff394f02/trove4j-1.0.20200330.jar"

BUILD_DIR="$ROOT_DIR/android/app/build"
GEN_DIR="$BUILD_DIR/generated/r"
OBJ_DIR="$BUILD_DIR/intermediates/classes"
DEX_DIR="$BUILD_DIR/intermediates/dex"
RES_ZIP="$BUILD_DIR/intermediates/res.zip"
UNALIGNED_APK="$BUILD_DIR/intermediates/app-unaligned.apk"
OUT_APK_DIR="$BUILD_DIR/outputs/apk/debug"
FINAL_APK="$OUT_APK_DIR/app-debug.apk"
Y1_API17_APK="$OUT_APK_DIR/y1-max-os-innioasis-api17.apk"

rm -rf "$GEN_DIR" "$OBJ_DIR" "$DEX_DIR"
mkdir -p "$GEN_DIR" "$OBJ_DIR" "$DEX_DIR" "$OUT_APK_DIR" "$ROOT_DIR/android/app/src/main/assets"

# 1. Copiar el bundle compilado por Metro/Hermes a assets/
HBC_FILE=$(find "$ROOT_DIR/dist-bundle/_expo/static/js/android" -name "*.hbc" 2>/dev/null | head -n 1 || true)
if [ -n "$HBC_FILE" ]; then
  cp "$HBC_FILE" "$ROOT_DIR/android/app/src/main/assets/index.android.bundle.hbc"
fi

echo "▶ [1/5] Compilando recursos Android y AndroidManifest.xml (minSdkVersion=17 para Innioasis Y1 Android 4.2.2)..."
"$BUILD_TOOLS/aapt2" compile --dir "$ROOT_DIR/android/app/src/main/res" -o "$RES_ZIP"

"$BUILD_TOOLS/aapt2" link \
  -I "$PLATFORM_JAR" \
  --manifest "$ROOT_DIR/android/app/src/main/AndroidManifest.xml" \
  --java "$GEN_DIR" \
  --min-sdk-version 17 \
  --target-sdk-version 28 \
  --version-code 1 \
  --version-name "1.0.0-y1max" \
  -A "$ROOT_DIR/android/app/src/main/assets" \
  -o "$UNALIGNED_APK" \
  "$RES_ZIP"

echo "▶ [2/5] Compilando código nativo Kotlin + Puente React API 17 + Motor de Audio Hi-Fi..."
KOTLIN_CP="$KOTLIN_COMPILER:$KOTLIN_STDLIB:$KOTLIN_REFLECT:$KOTLIN_SCRIPT:$KOTLIN_DAEMON:$KOTLIN_COROUTINES:$JETBRAINS_ANNOTATIONS:$TROVE4J"
KT_SOURCES=$(find "$ROOT_DIR/android/app/src/main/java" -name "*.kt")
JAVA_SOURCES=$(find "$GEN_DIR" -name "*.java")

java -cp "$KOTLIN_CP" org.jetbrains.kotlin.cli.jvm.K2JVMCompiler \
  -no-stdlib \
  -classpath "$PLATFORM_JAR:$KOTLIN_STDLIB:$JETBRAINS_ANNOTATIONS" \
  -jvm-target 1.8 \
  -d "$OBJ_DIR" \
  $KT_SOURCES $JAVA_SOURCES

javac --release 8 \
  -cp "$PLATFORM_JAR:$OBJ_DIR" \
  -d "$OBJ_DIR" \
  $JAVA_SOURCES

echo "▶ [3/5] Generando Dalvik Single-DEX (formato DEX 035 compatible con Android 4.2.2 API 17)..."
CLASS_FILES=$(find "$OBJ_DIR" -name "*.class")
"$BUILD_TOOLS/d8" \
  --min-api 17 \
  --lib "$PLATFORM_JAR" \
  --output "$DEX_DIR" \
  $CLASS_FILES \
  "$KOTLIN_STDLIB"

echo "▶ [4/5] Empaquetando classes.dex y alineando APK a 4 bytes (zipalign)..."
(cd "$DEX_DIR" && zip -q "$UNALIGNED_APK" classes.dex)
"$BUILD_TOOLS/zipalign" -f -p 4 "$UNALIGNED_APK" "$FINAL_APK"

echo "▶ [5/5] Firmando APK con esquemas v1 (JAR para Android 4.2.2) + v2 (Android 7+)..."
KEYSTORE="$ROOT_DIR/android/app/debug.keystore"
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair \
    -v \
    -keystore "$KEYSTORE" \
    -storepass android \
    -alias androiddebugkey \
    -keypass android \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -dname "CN=Android Debug,O=Android,C=US" >/dev/null 2>&1
fi

"$BUILD_TOOLS/apksigner" sign \
  --ks "$KEYSTORE" \
  --ks-key-alias androiddebugkey \
  --ks-pass pass:android \
  --key-pass pass:android \
  --v1-signing-enabled true \
  --v2-signing-enabled true \
  "$FINAL_APK"

cp "$FINAL_APK" "$Y1_API17_APK"

"$BUILD_TOOLS/apksigner" verify --verbose "$FINAL_APK" | head -n 10
"$BUILD_TOOLS/aapt2" dump badging "$FINAL_APK" | head -n 6
echo "✅ Compilación APK completada:"
ls -lh "$FINAL_APK" "$Y1_API17_APK"
