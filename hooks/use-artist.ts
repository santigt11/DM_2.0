import useSWR from "swr"
import { getArtistDetails } from "@/lib/api"
import type { Artist } from "@/lib/types"

export const useArtist = (artistId: number | null) => {
  const { data, error, isLoading } = useSWR<Artist>(
    artistId ? ["artist", artistId] : null,
    () => getArtistDetails(artistId!),
    {
      revalidateOnFocus: false,
    },
  )

  return {
    artist: data,
    isLoading,
    error,
  }
}
