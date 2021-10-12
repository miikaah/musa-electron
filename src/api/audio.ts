import { AlbumCollection, FileCollection, FileWithInfo, Metadata } from "musa-core";
import { getAudio, Audio } from "../db";

export type AudioWithMetadata = FileWithInfo & {
  track: string | null;
  coverUrl?: string;
  metadata: Metadata;
};

type Params = {
  audioCollection: FileCollection;
  albumCollection: AlbumCollection;
  id: string;
  existingDbAudio?: Audio;
};

export const getAudioById = async ({
  audioCollection,
  albumCollection,
  id,
  existingDbAudio,
}: Params): Promise<AudioWithMetadata> => {
  const audio = audioCollection[id];

  if (!audio) {
    // @ts-expect-error return empty
    return {};
  }

  const album = albumCollection[audio.albumId as string];
  const dbAudio = existingDbAudio || (await getAudio(id));
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
