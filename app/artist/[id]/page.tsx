"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Play, ChevronDown, ChevronUp } from "lucide-react"
import { useSettingsStore } from "@/store/settings-store"
import { usePlayerStore } from "@/store/player-store"
import { Sidebar } from "@/components/app/sidebar"
import { PlayerBar } from "@/components/app/player-bar"
import { MobileNav } from "@/components/app/mobile-nav"
import { TrackList } from "@/components/app/track-list"
import { AlbumCard } from "@/components/app/album-card"
import { LoadingSpinner } from "@/components/app/loading-spinner"
import { EmptyState } from "@/components/app/empty-state"
import { Button } from "@/components/ui/button"
import { useArtist } from "@/hooks/use-artist"
import { topTracksToPlayerTracks } from "@/lib/api"

export default function ArtistPage() {
  const params = useParams()
  const router = useRouter()
  const theme = useSettingsStore((state) => state.theme)
  const { loadAndPlayQueue } = usePlayerStore((state) => state.actions)
  const [isBioExpanded, setIsBioExpanded] = useState(false)

  const artistId = Number.parseInt(params.id as string)
  const { artist, isLoading, error } = useArtist(artistId)

  useEffect(() => {
    if (theme !== "custom") {
      document.documentElement.setAttribute("data-theme", theme)
    } else {
      document.documentElement.removeAttribute("data-theme")
    }
    document.documentElement.classList.add("dark")
  }, [theme])

  const handlePlayTopTracks = () => {
    if (artist && artist.top_tracks.length > 0) {
      const tracks = topTracksToPlayerTracks(artist.top_tracks, artist.name.display)
      loadAndPlayQueue(tracks, 0)
    }
  }

  const handleAlbumClick = (albumId: string) => {
    router.push(`/album/${albumId}`)
  }

  if (isLoading) {
    return (
      <div className="flex h-screen flex-col">
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto pb-24 lg:pb-0">
            <LoadingSpinner />
          </main>
        </div>
        <PlayerBar />
        <MobileNav />
      </div>
    )
  }

  if (error || !artist) {
    return (
      <div className="flex h-screen flex-col">
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto pb-24 lg:pb-0">
            <EmptyState title="Artist not found" description="The artist you're looking for doesn't exist." />
          </main>
        </div>
        <PlayerBar />
        <MobileNav />
      </div>
    )
  }

  const topTracks = topTracksToPlayerTracks(artist.top_tracks, artist.name.display)

  const bioText = artist.biography?.content || ""
  const bioLines = bioText.split("\n").filter((line) => line.trim())
  const shouldTruncate = bioLines.length > 3
  const displayBio = shouldTruncate && !isBioExpanded ? bioLines.slice(0, 3).join("\n") : bioText

  return (
    <div className="flex h-screen flex-col">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-y-auto pb-24 lg:pb-0">
          <div className="p-6">
            <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-6">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>

            <div className="mb-12">
              <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Artist</p>
              <h1 className="mt-2 font-serif text-6xl font-bold tracking-tight">{artist.name.display}</h1>

              {bioText && (
                <div className="mt-6 max-w-3xl">
                  <div className={`relative ${shouldTruncate && !isBioExpanded ? "max-h-24 overflow-hidden" : ""}`}>
                    <p className="whitespace-pre-line text-pretty leading-relaxed text-muted-foreground">
                      {displayBio}
                    </p>
                    {shouldTruncate && !isBioExpanded && (
                      <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background to-transparent" />
                    )}
                  </div>
                  {shouldTruncate && (
                    <Button variant="ghost" size="sm" onClick={() => setIsBioExpanded(!isBioExpanded)} className="mt-2">
                      {isBioExpanded ? (
                        <>
                          <ChevronUp className="mr-2 h-4 w-4" />
                          Show less
                        </>
                      ) : (
                        <>
                          <ChevronDown className="mr-2 h-4 w-4" />
                          Read more
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )}
            </div>

            {topTracks.length > 0 && (
              <div className="mb-12">
                <div className="mb-6 flex items-center justify-between">
                  <h2 className="text-2xl font-semibold">Top Tracks</h2>
                  <Button onClick={handlePlayTopTracks}>
                    <Play className="mr-2 h-4 w-4 fill-current" />
                    Play All
                  </Button>
                </div>
                <div className="rounded-lg bg-card">
                  <TrackList tracks={topTracks} showArtwork />
                </div>
              </div>
            )}

            {artist.releases.map((release) => {
              if (release.items.length === 0) return null

              return (
                <div key={release.type} className="mb-12">
                  <h2 className="mb-6 text-2xl font-semibold capitalize">
                    {release.type}s {release.has_more && <span className="text-sm text-muted-foreground">(Top)</span>}
                  </h2>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {release.items.map((item) => (
                      <AlbumCard
                        key={item.id}
                        album={{
                          id: item.id,
                          title: item.title,
                          artist: {
                            name: item.artist.name.display,
                            id: artistId,
                          },
                          image: {
                            small: item.image.large,
                            large: item.image.large,
                          },
                          release_date_original: item.dates.original,
                        }}
                        onClick={() => handleAlbumClick(item.id)}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </main>
      </div>

      <PlayerBar />
      <MobileNav />
    </div>
  )
}
