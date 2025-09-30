"use client"

import { useState } from "react"
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  ListMusic,
  Download,
} from "lucide-react"
import { usePlayerStore } from "@/store/player-store"
import { formatDuration } from "@/lib/utils"
import { Slider } from "@/components/ui/slider"
import { useAudioPlayer } from "@/hooks/use-audio-player"
import { QueuePanel } from "./queue-panel"

export const PlayerBar = () => {
  useAudioPlayer()
  const [isQueueOpen, setIsQueueOpen] = useState(false)

  const isPlaying = usePlayerStore((state) => state.isPlaying)
  const currentTrack = usePlayerStore((state) => state.currentTrack)
  const playbackPosition = usePlayerStore((state) => state.playbackPosition)
  const volume = usePlayerStore((state) => state.volume)
  const repeatMode = usePlayerStore((state) => state.repeatMode)
  const isShuffled = usePlayerStore((state) => state.isShuffled)
  const streamUrl = usePlayerStore((state) => state.streamUrl)

  const { playPause, nextTrack, prevTrack, seekTo, setVolume, toggleShuffle, cycleRepeatMode } = usePlayerStore(
    (state) => state.actions,
  )

  const handleSeek = (value: number[]) => {
    seekTo(value[0])
  }

  const handleVolumeChange = (value: number[]) => {
    setVolume(value[0])
  }

  const handleDownload = () => {
    if (streamUrl && currentTrack) {
      const link = document.createElement("a")
      link.href = streamUrl
      link.download = `${currentTrack.artistName} - ${currentTrack.title}.flac`
      link.click()
    }
  }

  const RepeatIcon = repeatMode === "one" ? Repeat1 : Repeat

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card lg:relative lg:bottom-auto lg:left-auto lg:right-auto lg:z-auto">
        <div className="flex h-20 items-center justify-between gap-2 px-3 lg:h-24 lg:gap-4 lg:px-6">
          <div className="flex w-20 items-center gap-2 lg:w-80 lg:gap-4">
            {currentTrack ? (
              <>
                <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded bg-muted lg:h-14 lg:w-14">
                  <img
                    src={currentTrack.artworkUrl || "/placeholder.svg"}
                    alt={currentTrack.title}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="hidden flex-col overflow-hidden lg:flex">
                  <div className="truncate font-medium">{currentTrack.title}</div>
                  <div className="truncate text-sm text-muted-foreground">{currentTrack.artistName}</div>
                </div>
              </>
            ) : (
              <>
                <div className="h-12 w-12 rounded bg-muted lg:h-14 lg:w-14" />
                <div className="hidden lg:block">
                  <div className="font-medium">No track playing</div>
                  <div className="text-sm text-muted-foreground">qstream</div>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-1 flex-col items-center gap-1 lg:gap-2">
            <div className="flex items-center gap-2 lg:gap-4">
              <button
                onClick={toggleShuffle}
                className={`hidden transition-colors lg:block ${isShuffled ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                disabled={!currentTrack}
              >
                <Shuffle className="h-4 w-4" />
              </button>

              <button
                onClick={prevTrack}
                className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                disabled={!currentTrack}
              >
                <SkipBack className="h-4 w-4 lg:h-5 lg:w-5" />
              </button>

              <button
                onClick={playPause}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105 disabled:opacity-50 lg:h-10 lg:w-10"
                disabled={!currentTrack}
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4 fill-current lg:h-5 lg:w-5" />
                ) : (
                  <Play className="h-4 w-4 fill-current lg:h-5 lg:w-5" />
                )}
              </button>

              <button
                onClick={nextTrack}
                className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                disabled={!currentTrack}
              >
                <SkipForward className="h-4 w-4 lg:h-5 lg:w-5" />
              </button>

              <button
                onClick={cycleRepeatMode}
                className={`hidden transition-colors lg:block ${repeatMode !== "off" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                disabled={!currentTrack}
              >
                <RepeatIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="flex w-full max-w-2xl items-center gap-2">
              <span className="text-xs text-muted-foreground">{formatDuration(playbackPosition)}</span>
              <Slider
                value={[playbackPosition]}
                max={currentTrack?.duration || 100}
                step={1}
                onValueChange={handleSeek}
                className="flex-1"
                disabled={!currentTrack}
              />
              <span className="text-xs text-muted-foreground">
                {currentTrack ? formatDuration(currentTrack.duration) : "0:00"}
              </span>
            </div>
          </div>

          <div className="flex w-20 items-center justify-end gap-2 lg:w-80 lg:gap-4">
            <button
              onClick={handleDownload}
              className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              disabled={!currentTrack || !streamUrl}
              title="Download track"
            >
              <Download className="h-4 w-4 lg:h-5 lg:w-5" />
            </button>

            <button
              onClick={() => setIsQueueOpen(!isQueueOpen)}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <ListMusic className="h-4 w-4 lg:h-5 lg:w-5" />
            </button>

            <div className="hidden items-center gap-2 lg:flex">
              {volume === 0 ? (
                <VolumeX className="h-5 w-5 text-muted-foreground" />
              ) : (
                <Volume2 className="h-5 w-5 text-muted-foreground" />
              )}
              <Slider value={[volume]} max={1} step={0.01} onValueChange={handleVolumeChange} className="w-24" />
            </div>
          </div>
        </div>
      </div>

      <QueuePanel isOpen={isQueueOpen} onClose={() => setIsQueueOpen(false)} />
    </>
  )
}
