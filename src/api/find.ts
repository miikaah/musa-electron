import {
  ArtistCollection,
  AlbumCollection,
  FileCollection,
  ArtistWithAlbums,
  AlbumWithFiles,
  FileWithInfo,
} from "musa-core";
import fuzzysort from "fuzzysort";
import { getArtistAlbums, Artist } from "./artist";
import { getAlbumById, AlbumWithFilesAndMetadata } from "./album";
import { getAudioById, AudioWithMetadata } from "./audio";
import { findAudiosByMetadataAndFilename } from "../db";

const options = { limit: 4, key: "name", threshold: -50 };

type ArtistsForFind = ArtistWithId[];
type AlbumsForFind = AlbumWithId[];
type ArtistWithId = ArtistWithAlbums & { id: string };
type AlbumWithId = AlbumWithFiles & { id: string };
type AudiosForFind = FileWithId[];
type FileWithId = FileWithInfo & { id: string };

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
}: {
  artistsForFind: ArtistsForFind;
  albumsForFind: AlbumsForFind;
  artistCollection: ArtistCollection;
  albumCollection: AlbumCollection;
  audioCollection: FileCollection;
  query: string;
}): Promise<Result> => {
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

function getRandomNumber(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

function getRandomNumbers(min: number, max: number, amount: number) {
  const randomNumbers: number[] = [];

  for (let i = 0; i < amount; i++) {
    randomNumbers.push(getRandomNumber(min, max));
  }

  return randomNumbers;
}

type Entities = ArtistsForFind | AlbumsForFind | AudiosForFind;

function getRandomEntities(entitiesForFind: Entities, indices: number[]) {
  const entities: ArtistWithId[] = [];

  for (const index of indices) {
    entities.push(entitiesForFind.at(index) as ArtistWithId);
  }

  return entities.filter(Boolean);
}

export const findRandom = async ({
  artistsForFind,
  albumsForFind,
  audiosForFind,
  artistCollection,
  albumCollection,
  audioCollection,
}: {
  artistsForFind: ArtistsForFind;
  albumsForFind: AlbumsForFind;
  audiosForFind: AudiosForFind;
  artistCollection: ArtistCollection;
  albumCollection: AlbumCollection;
  audioCollection: FileCollection;
}): Promise<Result> => {
  const artistIndices = getRandomNumbers(0, artistsForFind.length, 4);
  const foundArtists = getRandomEntities(artistsForFind, artistIndices);
  const artists = await Promise.all(
    foundArtists.map(async (a) => getArtistAlbums(artistCollection, albumCollection, a.id))
  );
  const albumIndices = getRandomNumbers(0, albumsForFind.length, 4);
  const foundAlbums = getRandomEntities(albumsForFind, albumIndices);
  const albums = await Promise.all(
    foundAlbums.map(async (a) => getAlbumById(albumCollection, a.id))
  );
  const audioIndices = getRandomNumbers(0, albumsForFind.length, 6);
  const foundAudios = getRandomEntities(audiosForFind, audioIndices);
  const audios = (
    await Promise.all(
      foundAudios.map(async (a) => getAudioById({ audioCollection, albumCollection, id: a.id }))
    )
  ).filter(({ id }) => !!audioCollection[id]);

  return {
    artists,
    albums,
    audios,
  };
};
