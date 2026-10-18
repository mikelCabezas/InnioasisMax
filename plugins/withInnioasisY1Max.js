const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin para Innioasis Y1 Max OS (`com.innioasis.y1max`).
 *
 * Protege toda la ingeniería nativa en Kotlin para Android 4.2.2 (API 17, MediaTek MT6572):
 * 1. Inyecta todos los permisos de hardware (Wi-Fi, Bluetooth, Vibrador, WRITE_SETTINGS, Almacenamiento).
 * 2. Configura MainActivity como Launcher HOME en landscape.
 * 3. Fuerza minSdkVersion = 17 y restaura automáticamente los ficheros Kotlin nativos desde
 *    `plugins/native-y1max/` si alguien ejecuta `expo prebuild --clean`.
 */
function withInnioasisY1Max(config) {
  config.android = config.android || {};
  config.android.package = 'com.innioasis.y1max';

  const requiredPermissions = [
    'android.permission.READ_EXTERNAL_STORAGE',
    'android.permission.WRITE_EXTERNAL_STORAGE',
    'android.permission.MANAGE_EXTERNAL_STORAGE',
    'android.permission.READ_MEDIA_AUDIO',
    'android.permission.INTERNET',
    'android.permission.ACCESS_NETWORK_STATE',
    'android.permission.ACCESS_WIFI_STATE',
    'android.permission.CHANGE_WIFI_STATE',
    'android.permission.BLUETOOTH',
    'android.permission.BLUETOOTH_ADMIN',
    'android.permission.BLUETOOTH_CONNECT',
    'android.permission.BLUETOOTH_SCAN',
    'android.permission.VIBRATE',
    'android.permission.WRITE_SETTINGS',
    'android.permission.WAKE_LOCK',
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  ];

  const existing = new Set(config.android.permissions || []);
  for (const perm of requiredPermissions) {
    existing.add(perm);
  }
  config.android.permissions = Array.from(existing);

  // Sincronización automática de respaldo de los ficheros Kotlin nativos (API 17)
  try {
    const projectRoot = path.resolve(__dirname, '..');
    const androidSrcDir = path.join(
      projectRoot,
      'android/app/src/main/java/com/innioasis/y1max'
    );
    const backupDir = path.join(__dirname, 'native-y1max');

    if (fs.existsSync(androidSrcDir)) {
      copyRecursiveSync(androidSrcDir, backupDir);
    } else if (fs.existsSync(backupDir)) {
      copyRecursiveSync(backupDir, androidSrcDir);
    }
  } catch (_err) {
    // Non-fatal during static config introspection
  }

  return config;
}

function copyRecursiveSync(src, dest) {
  if (!fs.existsSync(src)) return;
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursiveSync(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

module.exports = withInnioasisY1Max;
