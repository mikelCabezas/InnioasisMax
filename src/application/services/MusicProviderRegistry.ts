import { MusicSourceType } from '../../domain/models/music';
import { IMusicProvider } from '../../domain/providers/IMusicProvider';
import { AppleMusicProvider } from '../../infrastructure/providers/AppleMusicProvider';
import { LocalMusicProvider } from '../../infrastructure/providers/LocalMusicProvider';
import { SpotifyMusicProvider } from '../../infrastructure/providers/SpotifyMusicProvider';

/**
 * MusicProviderRegistry: Registro singleton de los tres motores de audio de Y1 Max OS.
 * Permite a la capa de aplicación/UI cambiar o combinar proveedores sin acoplarse a sus implementaciones.
 */
class MusicProviderRegistry {
  public readonly local = new LocalMusicProvider();
  public readonly spotify = new SpotifyMusicProvider();
  public readonly appleMusic = new AppleMusicProvider();

  private readonly map: Record<MusicSourceType, IMusicProvider> = {
    local: this.local,
    spotify: this.spotify,
    apple_music: this.appleMusic,
  };

  public getProvider(source: MusicSourceType): IMusicProvider {
    return this.map[source];
  }

  public async initializeAll(): Promise<void> {
    await Promise.all([
      this.local.initialize(),
      this.spotify.initialize(),
      this.appleMusic.initialize(),
    ]);
  }
}

export const musicProviders = new MusicProviderRegistry();
