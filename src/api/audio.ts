import { AlbumCollection, FileCollection, FileWithInfo, Metadata } from "musa-core";
import { getAudio } from "../db";

type AudioWithMetadata = FileWithInfo & {
  track: string | null;
  coverUrl?: string;
  metadata: Metadata;
};

export const getAudioById = async (
  audioCollection: FileCollection,
  albumCollection: AlbumCollection,
  id: string
): Promise<AudioWithMetadata> => {
  const audio = audioCollection[id];

  if (!audio) {
    // @ts-expect-error return empty
    return {};
  }

  const album = albumCollection[audio.albumId as string];
  const dbAudio = await getAudio(id);
  const name = dbAudio?.metadata?.title || audio.name;
  const trackNo = `${dbAudio?.metadata?.track?.no || ""}`;
  const diskNo = `${dbAudio?.metadata?.disk?.no || ""}`;
  const track = `${diskNo ? `${diskNo}.` : ""}${trackNo.padStart(2, "0")}`;

  return {
    ...audio,
    name,
    track: track === "00" ? null : track,
    fileUrl: audio.url,
    coverUrl: album?.coverUrl,
    metadata: dbAudio?.metadata,
  };
};
