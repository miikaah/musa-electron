import { AlbumCollection, AlbumWithFiles, Metadata } from "musa-core";
import { getAlbum, enrichAlbumFiles, EnrichedAlbumFile } from "../db";

type AlbumWithFilesAndMetadata = Omit<AlbumWithFiles, "files"> & {
  metadata: Metadata;
  files: EnrichedAlbumFile[];
};

export const getAlbumById = async (
  albumCollection: AlbumCollection,
  id: string
): Promise<AlbumWithFilesAndMetadata | never[]> => {
  const album = albumCollection[id];

  if (!album) {
    return [];
  }

  const dbAlbum = await getAlbum(id);
  const files = await enrichAlbumFiles(album);

  return {
    ...album,
    metadata: dbAlbum?.metadata,
    files,
  };
};
