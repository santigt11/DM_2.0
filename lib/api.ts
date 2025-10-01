import type {
  SearchResponse,
  AlbumResponse,
  ArtistResponse,
  StreamResponse,
  PlayerTrack,
  Album,
  AlbumDetails,
} from "./types"

let apiBaseUrl = "https://qqdl.site/api"

export const setApiBaseUrl = (url: string) => {
  apiBaseUrl = url
  console.log("API base URL set to:", url)
}

export const getApiBaseUrl = () => apiBaseUrl

export const searchMusic = async (query: string): Promise<Album[]> => {
  const url = `${apiBaseUrl}/get-music?q=${encodeURIComponent(query)}&offset=0&type=track`
  console.log("Searching music:", url)

  try {
    const response = await fetch(url)

    if (!response.ok) {
      console.error("Search failed with status:", response.status, response.statusText)
      throw new Error(`Failed to search music: ${response.status}`)
    }

    const data: SearchResponse = await response.json()
    console.log("Search response success:", data.success, "Albums found:", data.data?.albums?.items?.length || 0)

    if (!data.success) {
      throw new Error("Search failed")
    }

    return data.data.albums.items
  } catch (error) {
    console.error("Search error:", error)
    throw error
  }
}

export const getAlbumDetails = async (albumId: string): Promise<AlbumDetails> => {
  const url = `${apiBaseUrl}/get-album?album_id=${albumId}`
  console.log("Fetching album:", url)

  try {
    const response = await fetch(url)

    if (!response.ok) {
      console.error("Album fetch failed with status:", response.status, response.statusText)
      throw new Error(`Failed to fetch album details: ${response.status}`)
    }

    const data: AlbumResponse = await response.json()

    if (!data.success) {
      throw new Error("Failed to load album")
    }

    console.log("Album loaded:", data.data.title, "Tracks:", data.data.tracks.items.length)
    return data.data
  } catch (error) {
    console.error("Album fetch error:", error)
    throw error
  }
}

export const getArtistDetails = async (artistId: number) => {
  const url = `${apiBaseUrl}/get-artist?artist_id=${artistId}`
  console.log("Fetching artist:", url)

  try {
    const response = await fetch(url)

    if (!response.ok) {
      console.error("Artist fetch failed with status:", response.status, response.statusText)
      throw new Error(`Failed to fetch artist details: ${response.status}`)
    }

    const data: ArtistResponse = await response.json()

    if (!data.success) {
      throw new Error("Failed to load artist")
    }

    console.log("Artist loaded:", data.data.artist.name.display)
    return data.data.artist
  } catch (error) {
    console.error("Artist fetch error:", error)
    throw error
  }
}

export const getTrackStreamUrl = async (trackId: string): Promise<string> => {
  const url = `${apiBaseUrl}/download-music?track_id=${trackId}`
  console.log("Fetching stream URL for track:", trackId, "from:", url)

  try {
    const response = await fetch(url)

    console.log("Stream URL fetch response:", {
      status: response.status,
      statusText: response.statusText,
      headers: {
        contentType: response.headers.get("content-type"),
        contentLength: response.headers.get("content-length"),
        accessControlAllowOrigin: response.headers.get("access-control-allow-origin"),
      },
    })

    if (!response.ok) {
      console.error("Stream URL fetch failed with status:", response.status, response.statusText)
      throw new Error(`Failed to fetch stream URL: ${response.status}`)
    }

    const data: StreamResponse = await response.json()
    console.log("Stream URL response:", {
      success: data.success,
      hasUrl: !!data.data?.url,
      urlLength: data.data?.url?.length,
      urlStart: data.data?.url?.substring(0, 50),
    })

    if (!data.success || !data.data?.url) {
      throw new Error("Failed to get stream URL - no URL in response")
    }

    try {
      const testResponse = await fetch(data.data.url, { method: "HEAD" })
      console.log("Stream URL accessibility test:", {
        status: testResponse.status,
        statusText: testResponse.statusText,
        contentType: testResponse.headers.get("content-type"),
        cors: testResponse.headers.get("access-control-allow-origin"),
      })
    } catch (testError) {
      console.error("Stream URL accessibility test failed:", testError)
    }

    console.log("Stream URL obtained successfully")
    return data.data.url
  } catch (error) {
    console.error("Stream URL fetch error:", error)
    throw error
  }
}

export const albumToPlayerTracks = (album: AlbumDetails): PlayerTrack[] => {
  return album.tracks.items.map((track) => ({
    id: track.id.toString(),
    title: track.title,
    artistName: album.artist.name,
    albumTitle: album.title,
    artworkUrl: album.image.large,
    duration: track.duration,
  }))
}

export const topTracksToPlayerTracks = (
  topTracks: Array<{
    id: number
    title: string
    duration: number
    album: {
      id: string
      title: string
      image: {
        small: string
      }
    }
  }>,
  artistName: string,
): PlayerTrack[] => {
  return topTracks.map((track) => ({
    id: track.id.toString(),
    title: track.title,
    artistName,
    albumTitle: track.album.title,
    artworkUrl: track.album.image.small,
    duration: track.duration,
  }))
}
