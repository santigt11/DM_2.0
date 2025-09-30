"use client"

import { X } from "lucide-react"
import { usePlayerStore } from "@/store/player-store"
import { formatDuration } from "@/lib/utils"

interface QueuePanelProps {
  isOpen: boolean
  onClose: () => void
}

export const QueuePanel = ({ isOpen, onClose }: QueuePanelProps) => {
  const queue = usePlayerStore((state) => state.queue)
  const currentTrack = usePlayerStore((state) => state.currentTrack)
  const currentIndex = usePlayerStore((state) => state.currentIndex)
  const { loadAndPlayQueue } = usePlayerStore((state) => state.actions)

  if (!isOpen) return null

  const handleTrackClick = (index: number) => {
    loadAndPlayQueue(queue, index)
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-96 border-l border-border bg-card shadow-2xl">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-lg font-semibold">Queue</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {queue.length === 0 ? (
            <div className="flex h-full items-center justify-center p-8 text-center">
              <div>
                <p className="text-sm text-muted-foreground">No tracks in queue</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col">
              {queue.map((track, index) => {
                const isCurrentTrack = index === currentIndex

                return (
                  <button
                    key={`${track.id}-${index}`}
                    onClick={() => handleTrackClick(index)}
                    className={`flex items-center gap-3 p-3 transition-colors hover:bg-accent ${
                      isCurrentTrack ? "bg-accent" : ""
                    }`}
                  >
                    <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded bg-muted">
                      <img
                        src={track.artworkUrl || "/placeholder.svg"}
                        alt={track.title}
                        className="h-full w-full object-cover"
                      />
                    </div>

                    <div className="flex flex-1 flex-col items-start gap-0.5 overflow-hidden">
                      <span
                        className={`truncate text-sm font-medium ${isCurrentTrack ? "text-primary" : "text-foreground"}`}
                      >
                        {track.title}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">{track.artistName}</span>
                    </div>

                    <span className="text-xs text-muted-foreground">{formatDuration(track.duration)}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
