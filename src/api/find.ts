import {
  ArtistCollection,
  AlbumCollection,
  FileCollection,
  ArtistWithAlbums,
  AlbumWithFiles,
} from "musa-core";
import fuzzysort from "fuzzysort";
import { getArtistAlbums, Artist } from "./artist";
import { getAlbumById, AlbumWithFilesAndMetadata } from "./album";
import { getAudioById, AudioWithMetadata } from "./audio";
import { findAudiosByMetadataAndFilename } from "../db";

const options = { limit: 4, key: "name", threshold: -50 };

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

type Result = {
  artists: Artist[];
  albums: AlbumWithFilesAndMetadata[];
  audios: AudioWithMetadata[];
};

export const find = async ({
  artistsForFind,
  albumsForFind,
  artistCollection,
  albumCollection,
  audioCollection,
  query,
}: Params): Promise<Result> => {
  if (query.length < 1) {
    return {
      artists: [],
      albums: [],
      audios: [],
    };
  }
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
  const foundAudios = await findAudiosByMetadataAndFilename(query, 6);
  const audios = (
    await Promise.all(
      foundAudios.map(async (a) =>
        getAudioById({ audioCollection, albumCollection, id: a.path_id, existingDbAudio: a })
      )
    )
  ).filter(({ id }) => !!audioCollection[id]);

  return {
    artists,
    albums,
    audios,
  };
};
