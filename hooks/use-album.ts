import useSWR from "swr"
import { getAlbumDetails } from "@/lib/api"
import type { AlbumDetails } from "@/lib/types"

export const useAlbum = (albumId: string | null) => {
  const { data, error, isLoading } = useSWR<AlbumDetails>(
    albumId ? ["album", albumId] : null,
    () => getAlbumDetails(albumId!),
    {
      revalidateOnFocus: false,
    },
  )

  return {
    album: data,
    isLoading,
    error,
  }
}
