import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { QRAuthSession } from '../../domain/providers/IMusicProvider';
import { Y1ThemePalette } from '../theme/y1Theme';

interface QRAuthModalProps {
  session: QRAuthSession;
  theme: Y1ThemePalette;
}

/**
 * QRAuthModal: Flujo de autenticación sin teclado en pantalla para Spotify (OAuth 2.0 PKCE / Device Code)
 * y Apple Music (MusicKit JS Pairing Bridge) en el Innioasis Y1.
 */
export const QRAuthModal: React.FC<QRAuthModalProps> = ({ session, theme }) => {
  const isSpotify = session.provider === 'spotify';
  const accentColor = isSpotify ? theme.accentSpotify : theme.accentAppleMusic;
  const providerTitle = isSpotify ? 'Spotify Connect Auth' : 'Apple Music (MusicKit)';

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Columna Izquierda: Código QR de alto contraste */}
      <View style={styles.qrColumn}>
        <View style={styles.qrFrame}>
          <QRCode
            value={session.verificationUriComplete}
            size={146}
            color="#000000"
            backgroundColor="#FFFFFF"
          />
        </View>
      </View>

      {/* Columna Derecha: Instrucciones de emparejamiento y Código de Dispositivo */}
      <View style={styles.instructionsColumn}>
        <View style={[styles.providerTag, { backgroundColor: accentColor }]}>
          <Text style={styles.providerTagText}>{providerTitle}</Text>
        </View>

        <Text style={[styles.heading, { color: theme.textPrimary }]}>
          Scan QR with your phone
        </Text>

        <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
          Sign in without typing on the Click Wheel. Visit{' '}
          <Text style={{ fontWeight: '700', color: theme.textPrimary }}>
            {session.verificationUri}
          </Text>{' '}
          or scan the QR code.
        </Text>

        <View
          style={[
            styles.codeBox,
            {
              borderColor: theme.statusBarBorder,
              backgroundColor: theme.surfaceRightPane,
            },
          ]}
        >
          <Text style={[styles.codeLabel, { color: theme.textSecondary }]}>
            PAIRING CODE
          </Text>
          <Text style={[styles.codeValue, { color: theme.textPrimary }]}>
            {session.userCode}
          </Text>
        </View>

        <Text style={[styles.footerHint, { color: theme.textSecondary }]}>
          Press CENTER button to simulate instant OAuth callback • MENU to cancel
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  qrColumn: {
    marginRight: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrFrame: {
    padding: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D0D5DD',
  },
  instructionsColumn: {
    flex: 1,
    justifyContent: 'center',
  },
  providerTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginBottom: 6,
  },
  providerTagText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  heading: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  bodyText: {
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 4,
  },
  codeBox: {
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  codeLabel: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  codeValue: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginTop: 1,
  },
  footerHint: {
    fontSize: 9.5,
    fontWeight: '600',
    marginTop: 10,
  },
});
