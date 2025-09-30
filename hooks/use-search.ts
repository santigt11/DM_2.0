import useSWR from "swr"
import { searchMusic } from "@/lib/api"
import type { Album } from "@/lib/types"

export const useSearch = (query: string) => {
  const { data, error, isLoading } = useSWR<Album[]>(
    query.trim() ? ["search", query] : null,
    () => searchMusic(query),
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
    },
  )

  return {
    albums: data,
    isLoading,
    error,
  }
}
