# Y1 Max OS (Innioasis Y1)

> **iPod Classic Inspired Custom OS & Hi-Fi Player/Launcher for the Innioasis Y1 Portable DAP**  
> Target Platform: **MediaTek MT6572** • **Android 4.2.2 (API 17)** • **Dalvik Single-DEX (DEX 035)** • **480×360 Landscape LCD**

---

## ⚠️ Important Notice / Aviso Importante (Streaming Providers)

> [!WARNING]
> **Apple Music y Spotify NO son funcionales actualmente.**
> 
> Debido a las limitaciones extremas del sistema base (Android 4.2.2 Jelly Bean / API 17, falta de Widevine L1/L3 moderno, stacks TLS obsoletos en stock MT6572 y restricciones de DRM de streaming), los módulos de integración y emparejamiento con Spotify y Apple Music son actualmente experimentales / prototipos.
> 
> **Si no es viable técnicamente reproducir audio DRM en esta versión de Android/hardware, estas opciones se retirarán del sistema para centrar el reproductor exclusivamente en reproducción local Hi-Fi de alta calidad (MicroSD / FLAC / MP3).**

---

## 🌟 Características Principales (Key Features)

### 1. Click Wheel Hardware Integration
* **Simulación e intercepción física**: Integración con el controlador táctil rotatorio y botones físicos del Innioasis Y1 (`CW`, `CCW`, `CENTER`, `MENU`, `PLAY_PAUSE`, `PREV`, `NEXT`).
* **Respuesta háptica y sonido**: Vibración suave configurable (`Soft`, `Medium`, `Strong`, `Off`) y sonido de click mecánico simulado en cada paso de la rueda.
* **Búsqueda alfanumérica por rueda**: Selector circular estilo iPod con cambio rápido entre teclado y navegación de resultados mediante `PLAY/PAUSE`.

### 2. Controlador de Auriculares 3.5mm Jack (ACCDET Driver)
* El hardware del Innioasis Y1 solo detecta interrupciones de 0Ω en el micro (no detecta botones físicos separados de volumen en auriculares de 3.5mm).
* **Máquina de estados de botón único (`HeadsetButtonController`)**:
  * **1 Click**: Play / Pausa.
  * **2 Clicks**: Siguiente pista.
  * **3 Clicks**: Pista anterior.
  * **Pulsación prolongada (Hold >= 450ms)**: Bucle de aumento de volumen cada 250ms con vibración háptica.
  * **1 Click + Pulsación prolongada (Click + Hold >= 450ms)**: Bucle de reducción de volumen cada 250ms.
  * Deduplicación de eventos en primer plano y broadcast background con prioridad máxima (`2147483647`).

### 3. Pantalla Now Playing Dinámica
* Carátula de álbum ampliada en alta resolución con sombra 3D.
* **Barra inferior dinámica única**: Muestra la barra de posición de la canción por defecto. Al girar la rueda, conmuta suavemente a la barra de volumen; al pulsar Center, amplía el indicador circular (*bolita*) y entra en modo búsqueda (*Scrubbing*).
* Animaciones fluidas a 60 FPS con interpolación lineal (`lerp`).

### 4. CoverFlow 3D
* Vista clásica CoverFlow tridimensional con carátulas locales, orden de renderizado en Z corregido (el álbum seleccionado siempre en el plano superior) y deslizamiento cinético.

### 5. Wi-Fi In-App y Sincronización Horaria (NTP)
* **Gestión de Wi-Fi nativa dentro de la app**: Escaneo de redes 2.4GHz y teclado en pantalla mediante Click Wheel para introducir contraseñas sin necesidad de salir a los ajustes stock de Android.
* **Date & Time Controller**: Sincronización automática de fecha/hora por Wi-Fi mediante encabezados HTTP/NTP, selector de zonas horarias (`Europe/Madrid` por defecto) y ajuste manual de horas y minutos.

### 6. Gestión de Energía, Reposo y Apagado Real
* **Control directo de backlight LCD** vía `/sys/class/leds/lcd-backlight/brightness` y root `/system/xbin/su`.
* Apagado total de retroiluminación en reposo incluso conectado por USB.
* **Bloqueo automático (1 minuto)** con desbloqueo de seguridad manteniendo pulsado Center durante 3 segundos.
* Opción **Power Off Device** en Settings para apagado completo de hardware.

---

## 🛠 Arquitectura Técnica

* **Lenguajes**: Kotlin 2.1 (JVM target 1.8), TypeScript / React Native 0.76 (Expo 52).
* **Motor Nativo Android**: `Y1MaxNativeRuntimeView.kt` implementa un motor gráfico acelerado por hardware directamente sobre `Canvas` de Android para garantizar 60 FPS estables sin sobrecargar la CPU MediaTek MT6572 dual-core.
* **DEX Compatibility**: Formato Dalvik Single-DEX `035` (`d8 --min-api 17`), empaquetado y firmado con esquema JAR v1 obligatorio para Android 4.2.2.
* **Expo Config Plugin**: `plugins/withInnioasisY1Max.js` preserva y sincroniza automáticamente toda la configuración nativa, permisos y fuentes Kotlin.

---

## 🚀 Compilación e Instalación

### Requisitos
* Android SDK (API 17 platform instalada o API 35 con `--min-api 17`).
* `build-tools/36.1.0` (o similar con `aapt2`, `d8`, `zipalign`, `apksigner`).
* Java 17+ / Kotlin CLI compiler.
* Node.js 18+.
* Dispositivo Innioasis Y1 conectado con Depuración USB habilitada.

### Pasos

1. **Instalar dependencias**:
   ```bash
   npm install
   ```

2. **Ejecutar tests unitarios**:
   ```bash
   npm test
   ```

3. **Compilar el APK optimizado para API 17**:
   ```bash
   npm run build:apk
   ```

4. **Instalar y arrancar en el dispositivo**:
   ```bash
   adb install -r android/app/build/outputs/apk/debug/y1-max-os-innioasis-api17.apk
   adb shell am force-stop com.innioasis.y1max
   adb shell am start -n com.innioasis.y1max/.MainActivity
   ```

---

## 📄 Licencia

MIT License. Desarrollado para la comunidad de reproductores de audio digital portátiles (DAP) y entusiastas del hardware Innioasis Y1.
