"use client"

import { useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Play } from "lucide-react"
import { useSettingsStore } from "@/store/settings-store"
import { usePlayerStore } from "@/store/player-store"
import { Sidebar } from "@/components/app/sidebar"
import { PlayerBar } from "@/components/app/player-bar"
import { MobileNav } from "@/components/app/mobile-nav"
import { TrackList } from "@/components/app/track-list"
import { LoadingSpinner } from "@/components/app/loading-spinner"
import { EmptyState } from "@/components/app/empty-state"
import { Button } from "@/components/ui/button"
import { useAlbum } from "@/hooks/use-album"
import { albumToPlayerTracks } from "@/lib/api"
import { formatDate } from "@/lib/utils"

export default function AlbumPage() {
  const params = useParams()
  const router = useRouter()
  const theme = useSettingsStore((state) => state.theme)
  const { loadAndPlayQueue } = usePlayerStore((state) => state.actions)

  const albumId = params.id as string
  const { album, isLoading, error } = useAlbum(albumId)

  useEffect(() => {
    if (theme !== "custom") {
      document.documentElement.setAttribute("data-theme", theme)
    } else {
      document.documentElement.removeAttribute("data-theme")
    }
    document.documentElement.classList.add("dark")
  }, [theme])

  const handlePlayAlbum = () => {
    if (album) {
      const tracks = albumToPlayerTracks(album)
      loadAndPlayQueue(tracks, 0)
    }
  }

  const handleArtistClick = () => {
    if (album) {
      router.push(`/artist/${album.artist.id}`)
    }
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

  if (error || !album) {
    return (
      <div className="flex h-screen flex-col">
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto pb-24 lg:pb-0">
            <EmptyState title="Album not found" description="The album you're looking for doesn't exist." />
          </main>
        </div>
        <PlayerBar />
        <MobileNav />
      </div>
    )
  }

  const tracks = albumToPlayerTracks(album)

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

            <div className="mb-8 flex flex-col gap-6 md:flex-row md:items-end">
              <div className="relative h-64 w-64 flex-shrink-0 overflow-hidden rounded-lg bg-muted shadow-2xl">
                <img
                  src={album.image.large || "/placeholder.svg"}
                  alt={album.title}
                  className="h-full w-full object-cover"
                />
              </div>

              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Album</p>
                  <h1 className="mt-2 font-serif text-5xl font-bold tracking-tight">{album.title}</h1>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <button onClick={handleArtistClick} className="font-medium hover:underline">
                    {album.artist.name}
                  </button>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-muted-foreground">{formatDate(album.release_date_original)}</span>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-muted-foreground">{album.tracks.items.length} tracks</span>
                </div>

                <Button onClick={handlePlayAlbum} size="lg" className="w-fit">
                  <Play className="mr-2 h-5 w-5 fill-current" />
                  Play Album
                </Button>
              </div>
            </div>

            <div className="rounded-lg bg-card">
              <TrackList tracks={tracks} />
            </div>
          </div>
        </main>
      </div>

      <PlayerBar />
      <MobileNav />
    </div>
  )
}
