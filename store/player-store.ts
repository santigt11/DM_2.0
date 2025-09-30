import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { PlayerTrack, RepeatMode } from "@/lib/types"

interface PlayerState {
  isPlaying: boolean
  currentTrack: PlayerTrack | null
  queue: PlayerTrack[]
  originalQueue: PlayerTrack[]
  currentIndex: number
  playbackPosition: number
  volume: number
  repeatMode: RepeatMode
  isShuffled: boolean
  streamUrl: string | null
}

interface PlayerActions {
  playPause: () => void
  setIsPlaying: (isPlaying: boolean) => void
  loadAndPlayQueue: (tracks: PlayerTrack[], startIndex?: number) => void
  nextTrack: () => void
  prevTrack: () => void
  seekTo: (position: number) => void
  setVolume: (volume: number) => void
  toggleShuffle: () => void
  cycleRepeatMode: () => void
  setPlaybackPosition: (position: number) => void
  setStreamUrl: (url: string | null) => void
  setCurrentTrack: (track: PlayerTrack | null) => void
}

type PlayerStore = PlayerState & { actions: PlayerActions }

const shuffleArray = <T,>(array: T[]): T[] => {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

export const usePlayerStore = create<PlayerStore>()(
  persist(
    (set, get) => ({
      isPlaying: false,
      currentTrack: null,
      queue: [],
      originalQueue: [],
      currentIndex: 0,
      playbackPosition: 0,
      volume: 0.7,
      repeatMode: "off",
      isShuffled: false,
      streamUrl: null,

      actions: {
        playPause: () => {
          set((state) => ({ isPlaying: !state.isPlaying }))
        },

        setIsPlaying: (isPlaying: boolean) => {
          set({ isPlaying })
        },

        loadAndPlayQueue: (tracks: PlayerTrack[], startIndex = 0) => {
          set({
            queue: tracks,
            originalQueue: tracks,
            currentIndex: startIndex,
            currentTrack: tracks[startIndex] || null,
            isPlaying: true,
            playbackPosition: 0,
            streamUrl: null,
          })
        },

        nextTrack: () => {
          const { queue, currentIndex, repeatMode } = get()

          if (repeatMode === "one") {
            set({ playbackPosition: 0, streamUrl: null })
            return
          }

          let nextIndex = currentIndex + 1

          if (nextIndex >= queue.length) {
            if (repeatMode === "all") {
              nextIndex = 0
            } else {
              set({ isPlaying: false })
              return
            }
          }

          set({
            currentIndex: nextIndex,
            currentTrack: queue[nextIndex] || null,
            playbackPosition: 0,
            streamUrl: null,
          })
        },

        prevTrack: () => {
          const { queue, currentIndex, playbackPosition } = get()

          if (playbackPosition > 3) {
            set({ playbackPosition: 0, streamUrl: null })
            return
          }

          const prevIndex = currentIndex - 1

          if (prevIndex < 0) {
            set({ playbackPosition: 0, streamUrl: null })
            return
          }

          set({
            currentIndex: prevIndex,
            currentTrack: queue[prevIndex] || null,
            playbackPosition: 0,
            streamUrl: null,
          })
        },

        seekTo: (position: number) => {
          set({ playbackPosition: position })
        },

        setVolume: (volume: number) => {
          set({ volume: Math.max(0, Math.min(1, volume)) })
        },

        toggleShuffle: () => {
          const { isShuffled, queue, originalQueue, currentTrack } = get()

          if (!isShuffled) {
            const shuffled = shuffleArray(queue)
            const currentIndex = shuffled.findIndex((track) => track.id === currentTrack?.id)
            set({
              isShuffled: true,
              queue: shuffled,
              currentIndex: currentIndex >= 0 ? currentIndex : 0,
            })
          } else {
            const currentIndex = originalQueue.findIndex((track) => track.id === currentTrack?.id)
            set({
              isShuffled: false,
              queue: originalQueue,
              currentIndex: currentIndex >= 0 ? currentIndex : 0,
            })
          }
        },

        cycleRepeatMode: () => {
          const { repeatMode } = get()
          const modes: RepeatMode[] = ["off", "all", "one"]
          const currentModeIndex = modes.indexOf(repeatMode)
          const nextMode = modes[(currentModeIndex + 1) % modes.length]
          set({ repeatMode: nextMode })
        },

        setPlaybackPosition: (position: number) => {
          set({ playbackPosition: position })
        },

        setStreamUrl: (url: string | null) => {
          set({ streamUrl: url })
        },

        setCurrentTrack: (track: PlayerTrack | null) => {
          set({ currentTrack: track })
        },
      },
    }),
    {
      name: "qstream-player",
      partialize: (state) => ({
        volume: state.volume,
        repeatMode: state.repeatMode,
      }),
    },
  ),
)
