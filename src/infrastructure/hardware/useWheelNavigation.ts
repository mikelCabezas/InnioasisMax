import { useEffect, useRef } from 'react';
import { BackHandler, DeviceEventEmitter, Platform } from 'react-native';
import { useY1Store } from '../../application/store/useY1Store';

export type HardwareWheelButton =
  | 'WHEEL_CW'
  | 'WHEEL_CCW'
  | 'CENTER'
  | 'MENU'
  | 'PLAY_PAUSE'
  | 'NEXT'
  | 'PREVIOUS';

interface HardwareKeyEventPayload {
  button: HardwareWheelButton;
  repeatCount?: number;
  timestamp?: number;
}

/**
 * Hook global de interceptación de eventos físicos de la Click Wheel del Innioasis Y1.
 * - Escucha el evento nativo `Y1HardwareKey` emitido desde `MainActivity.kt` (Android KeyEvents).
 * - Implementa aceleración balística cuando el usuario gira la rueda rápidamente (`delta < 45ms`).
 * - Soporta también teclado físico/web (Flechas, Enter, Escape, Espacio) para desarrollo rápido.
 */
export function useWheelNavigation(): void {
  const wheelStep = useY1Store((s) => s.wheelStep);
  const pressCenter = useY1Store((s) => s.pressCenter);
  const pressMenuBack = useY1Store((s) => s.pressMenuBack);
  const pressPlayPause = useY1Store((s) => s.pressPlayPause);
  const pressNext = useY1Store((s) => s.pressNext);
  const pressPrevious = useY1Store((s) => s.pressPrevious);

  const lastTickTimestampRef = useRef<number>(0);

  useEffect(() => {
    const handleHardwareButton = (button: HardwareWheelButton) => {
      const now = Date.now();
      const deltaMs = now - lastTickTimestampRef.current;
      lastTickTimestampRef.current = now;

      // Aceleración balística en listas largas (>1000 canciones) si el usuario gira rápido la Click Wheel
      const accelerationMultiplier = deltaMs < 32 ? 3 : deltaMs < 65 ? 2 : 1;

      switch (button) {
        case 'WHEEL_CW':
          for (let i = 0; i < accelerationMultiplier; i++) {
            wheelStep(1);
          }
          break;
        case 'WHEEL_CCW':
          for (let i = 0; i < accelerationMultiplier; i++) {
            wheelStep(-1);
          }
          break;
        case 'CENTER':
          void pressCenter();
          break;
        case 'MENU':
          pressMenuBack();
          break;
        case 'PLAY_PAUSE':
          void pressPlayPause();
          break;
        case 'NEXT':
          void pressNext();
          break;
        case 'PREVIOUS':
          void pressPrevious();
          break;
      }
    };

    // 1. Suscripción al EventEmitter nativo de Android (MainActivity.kt -> dispatchKeyEvent)
    const subscription = DeviceEventEmitter.addListener(
      'Y1HardwareKey',
      (payload: HardwareKeyEventPayload) => {
        if (payload?.button) {
          handleHardwareButton(payload.button);
        }
      }
    );

    // 2. Bloqueo del BackHandler de Android para que el botón Atrás/Menu nunca salga del Kiosk Launcher
    const backSubscription = BackHandler.addEventListener('hardwareBackPress', () => {
      pressMenuBack();
      return true;
    });

    // 3. Soporte de teclado si se prueba en entorno Web / Desktop
    let cleanupWebKeyboard: (() => void) | undefined;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const onKeyDown = (e: KeyboardEvent) => {
        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault();
            handleHardwareButton('WHEEL_CW');
            break;
          case 'ArrowUp':
            e.preventDefault();
            handleHardwareButton('WHEEL_CCW');
            break;
          case 'Enter':
            e.preventDefault();
            handleHardwareButton('CENTER');
            break;
          case 'Escape':
          case 'Backspace':
            e.preventDefault();
            handleHardwareButton('MENU');
            break;
          case ' ':
            e.preventDefault();
            handleHardwareButton('PLAY_PAUSE');
            break;
          case 'ArrowRight':
            e.preventDefault();
            handleHardwareButton('NEXT');
            break;
          case 'ArrowLeft':
            e.preventDefault();
            handleHardwareButton('PREVIOUS');
            break;
        }
      };
      window.addEventListener('keydown', onKeyDown);
      cleanupWebKeyboard = () => window.removeEventListener('keydown', onKeyDown);
    }

    return () => {
      subscription.remove();
      backSubscription.remove();
      cleanupWebKeyboard?.();
    };
  }, [wheelStep, pressCenter, pressMenuBack, pressPlayPause, pressNext, pressPrevious]);
}
