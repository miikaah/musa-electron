import { AlbumCollection, AlbumWithFiles, Metadata } from "musa-core";
import { getAlbum, enrichAlbumFiles, EnrichedAlbumFile } from "../db";

export type AlbumWithFilesAndMetadata = Omit<AlbumWithFiles, "files"> & {
  metadata: Metadata;
  files: EnrichedAlbumFile[];
};

export const getAlbumById = async (
  albumCollection: AlbumCollection,
  id: string
): Promise<AlbumWithFilesAndMetadata> => {
  const album = albumCollection[id];

  if (!album) {
    // @ts-expect-error return empty
    return {};
  }

  const dbAlbum = await getAlbum(id);
  const files = await enrichAlbumFiles(album);

  return {
    ...album,
    metadata: dbAlbum?.metadata,
    files,
  };
};
