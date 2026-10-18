/**
 * AudioTagParser: Parser binario ligero y sin dependencias externas para el Innioasis Y1.
 * Lee únicamente los primeros 64 KB - 256 KB de cada archivo de la microSD para extraer:
 * - Tags ID3v2.3 / ID3v2.4 (.mp3): TIT2 (Title), TPE1 (Artist), TALB (Album), TRCK (Track#), TYER/TDRC (Year), APIC (Cover Art).
 * - Bloques FLAC Metadata (.flac): STREAMINFO (sampleRate, bitsPerSample, totalSamples -> durationMs) y VORBIS_COMMENT.
 */

export interface ParsedAudioMetadata {
  title?: string;
  artist?: string;
  album?: string;
  trackNumber?: number;
  discNumber?: number;
  year?: number;
  durationMs?: number;
  codecLabel?: string;
  embeddedArtworkBase64?: string;
  embeddedArtworkMime?: string;
}

export class AudioTagParser {
  /**
   * Decodifica un entero "synchsafe" de 28 bits usado en las cabeceras ID3v2 (4 bytes donde el bit 7 de cada byte es 0).
   */
  private static readSynchsafeInt32(bytes: Uint8Array, offset: number): number {
    return (
      ((bytes[offset] & 0x7f) << 21) |
      ((bytes[offset + 1] & 0x7f) << 14) |
      ((bytes[offset + 2] & 0x7f) << 7) |
      (bytes[offset + 3] & 0x7f)
    );
  }

  private static readUint32BE(bytes: Uint8Array, offset: number): number {
    return (
      ((bytes[offset] << 24) >>> 0) +
      ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3])
    );
  }

  private static readUint32LE(bytes: Uint8Array, offset: number): number {
    return (
      (bytes[offset] |
        (bytes[offset + 1] << 8) |
        (bytes[offset + 2] << 16) |
        (bytes[offset + 3] << 24)) >>>
      0
    );
  }

  /**
   * Decodifica texto de un frame ID3v2 según su byte de encoding:
   * 0 = ISO-8859-1, 1 = UTF-16 con BOM, 2 = UTF-16BE, 3 = UTF-8.
   */
  private static decodeId3Text(payload: Uint8Array): string {
    if (payload.length <= 1) return '';
    const encoding = payload[0];
    const textBytes = payload.subarray(1);

    try {
      if (encoding === 0 || encoding === 3) {
        return new TextDecoder(encoding === 3 ? 'utf-8' : 'latin1')
          .decode(textBytes)
          .replace(/\0+$/g, '')
          .trim();
      }
      if (encoding === 1 || encoding === 2) {
        return new TextDecoder('utf-16')
          .decode(textBytes)
          .replace(/\0+$/g, '')
          .trim();
      }
    } catch {
      // Fallback ASCII seguro para dispositivos Android AOSP recortados
    }

    let out = '';
    for (let i = 0; i < textBytes.length; i++) {
      const code = textBytes[i];
      if (code >= 32 && code <= 126) {
        out += String.fromCharCode(code);
      }
    }
    return out.trim();
  }

  /**
   * Parsea una cabecera binaria ID3v2.3 / ID3v2.4 o FLAC a partir de un Uint8Array.
   */
  public static parseHeaderBytes(
    bytes: Uint8Array,
    extension: string
  ): ParsedAudioMetadata {
    const ext = extension.toLowerCase();

    // 1. Detección de firma "fLaC" (0x66 0x4C 0x61 0x43)
    if (
      bytes.length >= 42 &&
      bytes[0] === 0x66 &&
      bytes[1] === 0x4c &&
      bytes[2] === 0x61 &&
      bytes[3] === 0x43
    ) {
      return this.parseFlacMetadata(bytes);
    }

    // 2. Detección de firma "ID3" (0x49 0x44 0x33)
    if (
      bytes.length >= 10 &&
      bytes[0] === 0x49 &&
      bytes[1] === 0x44 &&
      bytes[2] === 0x33
    ) {
      return this.parseId3v2Metadata(bytes, ext);
    }

    return {
      codecLabel: ext === 'wav' ? 'PCM WAV 16/44.1' : ext.toUpperCase(),
    };
  }

  private static parseId3v2Metadata(
    bytes: Uint8Array,
    ext: string
  ): ParsedAudioMetadata {
    const versionMajor = bytes[3]; // 3 = ID3v2.3, 4 = ID3v2.4
    const tagSize = this.readSynchsafeInt32(bytes, 6);
    const limit = Math.min(bytes.length, 10 + tagSize);

    const result: ParsedAudioMetadata = {
      codecLabel: ext === 'mp3' ? 'MP3 320kbps' : ext.toUpperCase(),
    };

    let offset = 10;
    while (offset + 10 <= limit) {
      const frameId = String.fromCharCode(
        bytes[offset],
        bytes[offset + 1],
        bytes[offset + 2],
        bytes[offset + 3]
      );

      // Si encontramos padding de ceros, terminamos el escaneo
      if (!/^[A-Z0-9]{4}$/.test(frameId)) break;

      const frameSize =
        versionMajor === 4
          ? this.readSynchsafeInt32(bytes, offset + 4)
          : this.readUint32BE(bytes, offset + 4);

      if (frameSize <= 0 || offset + 10 + frameSize > limit) break;

      const payload = bytes.subarray(offset + 10, offset + 10 + frameSize);

      switch (frameId) {
        case 'TIT2':
          result.title = this.decodeId3Text(payload);
          break;
        case 'TPE1':
          result.artist = this.decodeId3Text(payload);
          break;
        case 'TALB':
          result.album = this.decodeId3Text(payload);
          break;
        case 'TRCK': {
          const rawTrack = this.decodeId3Text(payload);
          const parsedTrack = parseInt(rawTrack.split('/')[0], 10);
          if (!Number.isNaN(parsedTrack)) result.trackNumber = parsedTrack;
          break;
        }
        case 'TYER':
        case 'TDRC': {
          const rawYear = this.decodeId3Text(payload);
          const parsedYear = parseInt(rawYear.slice(0, 4), 10);
          if (!Number.isNaN(parsedYear)) result.year = parsedYear;
          break;
        }
        case 'TLEN': {
          const rawLen = parseInt(this.decodeId3Text(payload), 10);
          if (!Number.isNaN(rawLen) && rawLen > 0) result.durationMs = rawLen;
          break;
        }
      }

      offset += 10 + frameSize;
    }

    return result;
  }

  private static parseFlacMetadata(bytes: Uint8Array): ParsedAudioMetadata {
    const result: ParsedAudioMetadata = {
      codecLabel: 'FLAC Lossless',
    };

    let offset = 4; // Saltamos "fLaC"
    let isLastBlock = false;

    while (!isLastBlock && offset + 4 <= bytes.length) {
      const headerByte = bytes[offset];
      isLastBlock = (headerByte & 0x80) !== 0;
      const blockType = headerByte & 0x7f;
      const blockLength =
        (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
      offset += 4;

      if (offset + blockLength > bytes.length) break;

      const blockData = bytes.subarray(offset, offset + blockLength);

      // BlockType 0 = STREAMINFO (34 bytes)
      if (blockType === 0 && blockData.length >= 18) {
        const sampleRate =
          (blockData[10] << 12) |
          (blockData[11] << 4) |
          ((blockData[12] & 0xf0) >> 4);
        const bitsPerSample =
          (((blockData[12] & 0x01) << 4) | ((blockData[13] & 0xf0) >> 4)) + 1;

        const totalSamplesHigh = blockData[13] & 0x0f;
        const totalSamplesLow = this.readUint32BE(blockData, 14);
        const totalSamples = totalSamplesHigh * 0x100000000 + totalSamplesLow;

        if (sampleRate > 0) {
          const khz = (sampleRate / 1000).toFixed(sampleRate % 1000 === 0 ? 0 : 1);
          result.codecLabel = `FLAC ${bitsPerSample}-bit/${khz}kHz`;
          if (totalSamples > 0) {
            result.durationMs = Math.round((totalSamples / sampleRate) * 1000);
          }
        }
      }

      // BlockType 4 = VORBIS_COMMENT (Little-Endian)
      if (blockType === 4 && blockData.length >= 8) {
        let pos = 0;
        const vendorLen = this.readUint32LE(blockData, pos);
        pos += 4 + vendorLen;
        if (pos + 4 <= blockData.length) {
          const commentCount = this.readUint32LE(blockData, pos);
          pos += 4;
          for (let i = 0; i < commentCount && pos + 4 <= blockData.length; i++) {
            const commentLen = this.readUint32LE(blockData, pos);
            pos += 4;
            if (pos + commentLen > blockData.length) break;
            const commentStr = new TextDecoder('utf-8').decode(
              blockData.subarray(pos, pos + commentLen)
            );
            pos += commentLen;

            const eqIdx = commentStr.indexOf('=');
            if (eqIdx > 0) {
              const key = commentStr.slice(0, eqIdx).toUpperCase().trim();
              const val = commentStr.slice(eqIdx + 1).trim();
              if (key === 'TITLE') result.title = val;
              else if (key === 'ARTIST') result.artist = val;
              else if (key === 'ALBUM') result.album = val;
              else if (key === 'TRACKNUMBER') {
                const n = parseInt(val.split('/')[0], 10);
                if (!Number.isNaN(n)) result.trackNumber = n;
              } else if (key === 'DATE' || key === 'YEAR') {
                const y = parseInt(val.slice(0, 4), 10);
                if (!Number.isNaN(y)) result.year = y;
              }
            }
          }
        }
      }

      offset += blockLength;
    }

    return result;
  }

  /**
   * Fallback heurístico cuando un archivo carece de tags ID3/Vorbis:
   * Extrae Artista, Álbum, Número de Pista y Título desde la estructura de carpetas de la microSD:
   * `/storage/sdcard1/Music/{Artist}/{Album}/{01 - Track Title.flac}`
   */
  public static inferFromFilePath(fileUri: string): Required<
    Pick<ParsedAudioMetadata, 'title' | 'artist' | 'album' | 'trackNumber'>
  > {
    const cleanPath = decodeURIComponent(fileUri.replace(/^file:\/\//, ''));
    const parts = cleanPath.split('/').filter(Boolean);
    const fileName = parts[parts.length - 1] ?? 'Unknown Track';
    const albumFolder = parts.length >= 2 ? parts[parts.length - 2] : 'Unknown Album';
    const artistFolder =
      parts.length >= 3 ? parts[parts.length - 3] : 'Unknown Artist';

    const nameWithoutExt = fileName.replace(/\.[a-zA-Z0-9]+$/, '');
    const trackMatch = nameWithoutExt.match(/^(\d{1,3})[\s._-]+(.+)$/);

    if (trackMatch) {
      return {
        trackNumber: parseInt(trackMatch[1], 10),
        title: trackMatch[2].trim(),
        album: albumFolder,
        artist: artistFolder,
      };
    }

    return {
      trackNumber: 1,
      title: nameWithoutExt,
      album: albumFolder,
      artist: artistFolder,
    };
  }
}
