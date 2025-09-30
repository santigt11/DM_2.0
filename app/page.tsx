"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { SearchIcon } from "lucide-react"
import { Sidebar } from "@/components/app/sidebar"
import { PlayerBar } from "@/components/app/player-bar"
import { MobileNav } from "@/components/app/mobile-nav"
import { AlbumCard } from "@/components/app/album-card"
import { LoadingSpinner } from "@/components/app/loading-spinner"
import { EmptyState } from "@/components/app/empty-state"
import { Input } from "@/components/ui/input"
import { useSearch } from "@/hooks/use-search"

export default function Home() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")

  const { albums, isLoading, error } = useSearch(debouncedQuery)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query)
    }, 500)

    return () => clearTimeout(timer)
  }, [query])

  const handleAlbumClick = (albumId: string) => {
    router.push(`/album/${albumId}`)
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-y-auto pb-24 lg:pb-0">
          <div className="p-6">
            <div className="mb-8">
              <h1 className="mb-4 font-serif text-4xl font-bold tracking-tight">Search</h1>
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search for albums, artists..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-10"
                  autoFocus
                />
              </div>
            </div>

            {isLoading && <LoadingSpinner />}

            {error && (
              <EmptyState
                title="Search failed"
                description="There was an error searching for music. Please try again."
              />
            )}

            {!isLoading && !error && albums && albums.length === 0 && debouncedQuery && (
              <EmptyState title="No results found" description={`No albums found for "${debouncedQuery}"`} />
            )}

            {!isLoading && !error && albums && albums.length > 0 && (
              <div>
                <h2 className="mb-4 text-xl font-semibold">Albums</h2>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {albums.map((album) => (
                    <AlbumCard key={album.id} album={album} onClick={() => handleAlbumClick(album.id)} />
                  ))}
                </div>
              </div>
            )}

            {!debouncedQuery && !isLoading && (
              <EmptyState title="Start searching" description="Enter a search query to find albums and artists" />
            )}
          </div>
        </main>
      </div>

      <PlayerBar />
      <MobileNav />
    </div>
  )
}
