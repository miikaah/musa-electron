import { ArtistCollection, AlbumCollection, ArtistWithAlbums } from "musa-core";
import { getAudio, enrichAlbums, EnrichedAlbum } from "../db";

type ArtistAlbum = {
  id: string;
  name: string;
  url: string;
  coverUrl?: string;
  year?: number | null;
};

export type Artist = Omit<ArtistWithAlbums, "albums"> & {
  albums: EnrichedAlbum[];
};

const byYear = (a: ArtistAlbum, b: ArtistAlbum) => Number(a.year) - Number(b.year);

export const getArtistById = async (
  artistCollection: ArtistCollection,
  id: string
): Promise<Artist> => {
  const artist = artistCollection[id];

  if (!artist) {
    // @ts-expect-error return empty
    return {};
  }

  const albums: ArtistAlbum[] = await Promise.all(
    artist.albums.map(async ({ id, name, url, coverUrl, firstAlbumAudio }) => {
      let year = null;
      let albumName = null;

      if (firstAlbumAudio && firstAlbumAudio.id) {
        const audio = await getAudio(firstAlbumAudio.id);

        year = audio?.metadata?.year;
        albumName = audio?.metadata?.album;
      }

      return {
        id,
        name: albumName || name,
        url,
        coverUrl,
        year,
      };
    })
  );

  return {
    ...artist,
    albums: albums.sort(byYear),
  };
};

export const getArtistAlbums = async (
  artistCollection: ArtistCollection,
  albumCollection: AlbumCollection,
  id: string
): Promise<Artist> => {
  const artist = artistCollection[id];

  if (!artist) {
    // @ts-expect-error return empty
    return [];
  }

  const albums = await enrichAlbums(albumCollection, artist);
  const files = await Promise.all(
    artist.files.map(async (file) => {
      const dbAudio = await getAudio(file.id);
      const name = dbAudio?.metadata?.title || file.name;
      const trackNo = `${dbAudio?.metadata?.track?.no || ""}`;
      const diskNo = `${dbAudio?.metadata?.disk?.no || ""}`;
      const track = `${diskNo ? `${diskNo}.` : ""}${trackNo.padStart(2, "0")}`;

      return {
        ...file,
        name,
        track: track === "00" ? null : track,
        metadata: dbAudio?.metadata,
      };
    })
  );

  return {
    ...artist,
    albums: albums.sort(byYear),
    files,
  };
};
