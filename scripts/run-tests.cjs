/**
 * Ejecutor de pruebas TypeScript en memoria para Y1 Max OS (sin requerir emulador para tests unitarios/integración).
 * Intercepta los módulos nativos de React Native / Expo con mocks deterministas y transpila TypeScript al vuelo.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const mockSubscriptions = () => ({ remove: () => {} });

const nativeMocks = {
  'react-native': {
    DeviceEventEmitter: {
      addListener: () => mockSubscriptions(),
    },
    NativeModules: {},
    StyleSheet: {
      create: (styles) => styles,
      absoluteFillObject: {},
    },
    View: 'View',
    Text: 'Text',
    Image: 'Image',
    FlatList: 'FlatList',
  },
  'expo-sqlite': {
    openDatabaseAsync: async () => {
      throw new Error('SQLite mock fallback to in-memory catalog');
    },
  },
  'expo-file-system': {
    getInfoAsync: async () => ({ exists: false, isDirectory: false }),
    readDirectoryAsync: async () => [],
    readAsStringAsync: async () => '',
    EncodingType: { Base64: 'base64' },
  },
  'expo-secure-store': {
    getItemAsync: async () => null,
    setItemAsync: async () => {},
    deleteItemAsync: async () => {},
  },
  'expo-linear-gradient': {
    LinearGradient: 'LinearGradient',
  },
  'react-native-qrcode-svg': 'QRCode',
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(nativeMocks, request)) {
    return nativeMocks[request];
  }
  return originalLoad.apply(this, arguments);
};

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (Object.prototype.hasOwnProperty.call(nativeMocks, request)) {
    return request;
  }
  if (request.startsWith('.') && parent && parent.filename) {
    const baseDir = path.dirname(parent.filename);
    const candidateBase = path.resolve(baseDir, request);
    for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
      if (fs.existsSync(candidateBase + ext)) {
        return candidateBase + ext;
      }
    }
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

function compileTsExtension(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
      strict: true,
    },
  });
  module._compile(transpiled.outputText, filename);
}

require.extensions['.ts'] = compileTsExtension;
require.extensions['.tsx'] = compileTsExtension;

require(path.resolve(__dirname, '../src/__tests__/y1MaxSuite.test.ts'));
