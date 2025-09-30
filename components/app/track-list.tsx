"use client"

import { Play } from "lucide-react"
import type { PlayerTrack } from "@/lib/types"
import { formatDuration } from "@/lib/utils"
import { usePlayerStore } from "@/store/player-store"

interface TrackListProps {
  tracks: PlayerTrack[]
  showArtwork?: boolean
}

export const TrackList = ({ tracks, showArtwork = false }: TrackListProps) => {
  const currentTrack = usePlayerStore((state) => state.currentTrack)
  const isPlaying = usePlayerStore((state) => state.isPlaying)
  const { loadAndPlayQueue } = usePlayerStore((state) => state.actions)

  const handleTrackClick = (index: number) => {
    loadAndPlayQueue(tracks, index)
  }

  return (
    <div className="flex flex-col">
      {tracks.map((track, index) => {
        const isCurrentTrack = currentTrack?.id === track.id
        const isActive = isCurrentTrack && isPlaying

        return (
          <button
            key={track.id}
            onClick={() => handleTrackClick(index)}
            className="group flex items-center gap-4 rounded-md px-4 py-3 transition-colors hover:bg-accent"
          >
            <div className="flex w-8 items-center justify-center text-sm text-muted-foreground">
              {isActive ? (
                <div className="flex gap-0.5">
                  <div className="h-3 w-0.5 animate-pulse bg-primary" />
                  <div className="h-3 w-0.5 animate-pulse bg-primary delay-75" />
                  <div className="h-3 w-0.5 animate-pulse bg-primary delay-150" />
                </div>
              ) : (
                <span className="group-hover:hidden">{index + 1}</span>
              )}
              <Play className="hidden h-4 w-4 fill-current group-hover:block" />
            </div>

            {showArtwork && (
              <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-muted">
                <img
                  src={track.artworkUrl || "/placeholder.svg"}
                  alt={track.title}
                  className="h-full w-full object-cover"
                />
              </div>
            )}

            <div className="flex flex-1 flex-col items-start gap-0.5">
              <span
                className={`line-clamp-1 text-sm font-medium ${isCurrentTrack ? "text-primary" : "text-foreground"}`}
              >
                {track.title}
              </span>
              <span className="line-clamp-1 text-xs text-muted-foreground">{track.artistName}</span>
            </div>

            {!showArtwork && <div className="hidden text-sm text-muted-foreground md:block">{track.albumTitle}</div>}

            <div className="text-sm text-muted-foreground">{formatDuration(track.duration)}</div>
          </button>
        )
      })}
    </div>
  )
}
