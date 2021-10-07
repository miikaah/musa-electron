import {
  ArtistCollection,
  AlbumCollection,
  FileCollection,
  ArtistWithAlbums,
  AlbumWithFiles,
} from "musa-core";
import fuzzysort from "fuzzysort";
import { getArtistAlbums } from "./artist";
import { getAlbumById } from "./album";
import { getAudioById } from "./audio";

const options = { limit: 10, key: "name", threshold: -50 };

type Params = {
  artistsForFind: ArtistsForFind;
  albumsForFind: AlbumsForFind;
  artistCollection: ArtistCollection;
  albumCollection: AlbumCollection;
  audioCollection: FileCollection;
  query: string;
};

type ArtistsForFind = (ArtistWithAlbums & { id: string })[];
type AlbumsForFind = (AlbumWithFiles & { id: string })[];

export const find = async ({
  artistsForFind,
  albumsForFind,
  artistCollection,
  albumCollection,
  audioCollection,
  query,
}: Params): Promise<unknown> => {
  const foundArtists = fuzzysort.go(query, artistsForFind, options);
  const artists = await Promise.all(
    foundArtists
      .map((a) => a.obj)
      .map(async (a) => getArtistAlbums(artistCollection, albumCollection, a.id))
  );
  const foundAlbums = fuzzysort.go(query, albumsForFind, options);
  const albums = await Promise.all(
    foundAlbums.map((a) => a.obj).map(async (a) => getAlbumById(albumCollection, a.id))
  );
  const foundAudios = fuzzysort.go(query, Object.values(audioCollection), options);
  const audios = await Promise.all(
    foundAudios
      .map((a) => a.obj)
      .map(async (a) => getAudioById(audioCollection, albumCollection, a.id))
  );

  return {
    artists,
    albums,
    audios,
  };
};
