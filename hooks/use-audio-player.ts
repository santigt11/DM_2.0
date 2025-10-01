"use client"

import { useEffect, useRef, useCallback } from "react"
import { usePlayerStore } from "@/store/player-store"
import { getTrackStreamUrl } from "@/lib/api"

export const useAudioPlayer = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const isLoadingRef = useRef(false)
  const hasAttemptedPlayRef = useRef(false)
  const currentTrackIdRef = useRef<string | null>(null)
  const pendingPlayRef = useRef<Promise<void> | null>(null)
  const isAudioReadyRef = useRef(false)

  const isPlaying = usePlayerStore((state) => state.isPlaying)
  const currentTrack = usePlayerStore((state) => state.currentTrack)
  const volume = usePlayerStore((state) => state.volume)
  const streamUrl = usePlayerStore((state) => state.streamUrl)
  const playbackPosition = usePlayerStore((state) => state.playbackPosition)

  const { setIsPlaying, setPlaybackPosition, nextTrack, setStreamUrl } = usePlayerStore((state) => state.actions)

  const loadStreamUrl = useCallback(async () => {
    if (!currentTrack || isLoadingRef.current || streamUrl) return

    isLoadingRef.current = true

    try {
      const url = await getTrackStreamUrl(currentTrack.id)

      if (!url || typeof url !== "string" || !url.startsWith("http")) {
        throw new Error(`Invalid stream URL received: ${url}`)
      }

      setStreamUrl(url)
      hasAttemptedPlayRef.current = false
    } catch (error) {
      console.error("Failed to load stream URL:", error)
      setIsPlaying(false)
      setStreamUrl(null)
    } finally {
      isLoadingRef.current = false
    }
  }, [currentTrack, streamUrl, setStreamUrl, setIsPlaying])

  useEffect(() => {
    if (currentTrack && currentTrackIdRef.current !== currentTrack.id) {
      const audio = audioRef.current

      if (audio) {
        // Cancel any pending play attempts
        if (pendingPlayRef.current) {
          pendingPlayRef.current = null
        }

        // Stop current playback
        audio.pause()
        audio.currentTime = 0

        // Clear the source
        if (audio.src && audio.src !== window.location.href) {
          audio.removeAttribute("src")
          audio.load()
        }
      }

      // Reset state for new track
      setPlaybackPosition(0)
      setStreamUrl(null)
      hasAttemptedPlayRef.current = false
      isAudioReadyRef.current = false
      currentTrackIdRef.current = currentTrack.id
    } else if (!currentTrack) {
      currentTrackIdRef.current = null
      isAudioReadyRef.current = false
    }
  }, [currentTrack, setPlaybackPosition, setStreamUrl])

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio()
      audioRef.current.crossOrigin = "anonymous"
      audioRef.current.preload = "metadata"

      audioRef.current.addEventListener("timeupdate", () => {
        if (audioRef.current && !audioRef.current.paused) {
          setPlaybackPosition(audioRef.current.currentTime)
        }
      })

      audioRef.current.addEventListener("ended", () => {
        nextTrack()
      })

      audioRef.current.addEventListener("canplay", () => {
        isAudioReadyRef.current = true
      })

      audioRef.current.addEventListener("loadstart", () => {
        isAudioReadyRef.current = false
      })

      audioRef.current.addEventListener("error", (e) => {
        const audio = e.target as HTMLAudioElement
        const error = audio.error

        if (!audio.src || audio.src === window.location.href) {
          return
        }

        let errorMessage = "Unknown audio error"
        let errorCode = "UNKNOWN"

        if (error) {
          switch (error.code) {
            case MediaError.MEDIA_ERR_ABORTED:
              errorMessage = "Audio loading aborted"
              errorCode = "ABORTED"
              break
            case MediaError.MEDIA_ERR_NETWORK:
              errorMessage = "Network error while loading audio"
              errorCode = "NETWORK"
              break
            case MediaError.MEDIA_ERR_DECODE:
              errorMessage = "Audio decoding failed"
              errorCode = "DECODE"
              break
            case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
              errorMessage = "Audio format not supported or source not accessible"
              errorCode = "SRC_NOT_SUPPORTED"
              break
          }
        }

        console.error("Audio playback error:", {
          errorCode,
          message: errorMessage,
          mediaErrorCode: error?.code,
          mediaErrorMessage: error?.message,
        })

        setIsPlaying(false)
        setStreamUrl(null)
        isAudioReadyRef.current = false
      })
    }

    return () => {
      if (audioRef.current) {
        console.log("Cleaning up audio element")
        audioRef.current.pause()
        audioRef.current.src = ""
      }
    }
  }, [setPlaybackPosition, nextTrack, setIsPlaying, setStreamUrl])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume
    }
  }, [volume])

  useEffect(() => {
    if (isPlaying && !streamUrl && currentTrack) {
      loadStreamUrl()
    }
  }, [isPlaying, streamUrl, currentTrack, loadStreamUrl])

  useEffect(() => {
    const audio = audioRef.current

    if (!audio) {
      return
    }

    // If playing but no stream URL yet, wait for it
    if (isPlaying && !streamUrl) {
      return
    }

    // If not playing and no stream URL, clear audio
    if (!isPlaying && !streamUrl) {
      if (audio.src && audio.src !== window.location.href) {
        audio.pause()
        audio.removeAttribute("src")
        audio.load()
        isAudioReadyRef.current = false
      }
      return
    }

    // If no stream URL, nothing to do
    if (!streamUrl) {
      return
    }

    // If source changed, load new source
    if (audio.src !== streamUrl) {
      // Cancel any pending play
      pendingPlayRef.current = null
      isAudioReadyRef.current = false

      audio.src = streamUrl
      audio.load()

      if (playbackPosition > 0) {
        audio.currentTime = playbackPosition
      }

      hasAttemptedPlayRef.current = false
    }

    if (isPlaying && !hasAttemptedPlayRef.current) {
      hasAttemptedPlayRef.current = true

      // Wait for audio to be ready before playing
      const attemptPlay = async () => {
        if (!audio || !isAudioReadyRef.current) {
          // Wait for canplay event
          await new Promise<void>((resolve) => {
            const onCanPlay = () => {
              audio?.removeEventListener("canplay", onCanPlay)
              resolve()
            }
            audio?.addEventListener("canplay", onCanPlay)
          })
        }

        // Check if we should still play (user might have paused)
        if (!isPlaying || pendingPlayRef.current !== playPromise) {
          return
        }

        try {
          await audio.play()
        } catch (error: any) {
          // Ignore AbortError - it's expected when switching tracks or pausing
          if (error.name === "AbortError") {
            return
          }

          console.error("Playback failed:", {
            name: error.name,
            message: error.message,
          })

          setIsPlaying(false)
          hasAttemptedPlayRef.current = false
        }
      }

      const playPromise = attemptPlay()
      pendingPlayRef.current = playPromise
    } else if (!isPlaying && !audio.paused) {
      // Cancel any pending play
      pendingPlayRef.current = null
      audio.pause()
      hasAttemptedPlayRef.current = false
    }
  }, [isPlaying, streamUrl, playbackPosition, setIsPlaying])

  useEffect(() => {
    if (audioRef.current && streamUrl && Math.abs(audioRef.current.currentTime - playbackPosition) > 1) {
      audioRef.current.currentTime = playbackPosition
    }
  }, [playbackPosition, streamUrl])

  useEffect(() => {
    if (currentTrack) {
      hasAttemptedPlayRef.current = false
    }
  }, [currentTrack])

  return audioRef
}
