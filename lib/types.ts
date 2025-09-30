export interface PlayerTrack {
  id: string
  title: string
  artistName: string
  albumTitle: string
  artworkUrl: string
  duration: number
}

export interface Album {
  id: string
  title: string
  artist: {
    name: string
    id: number
  }
  image: {
    small: string
    large: string
  }
  release_date_original: string
}

export interface AlbumDetails extends Album {
  tracks: {
    items: Array<{
      id: number
      title: string
      duration: number
      track_number: number
    }>
  }
}

export interface Artist {
  id: number
  name: {
    display: string
  }
  biography?: {
    content: string
  }
  images?: Record<string, unknown>
  top_tracks: Array<{
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
  }>
  releases: Array<{
    type: string
    has_more: boolean
    items: Array<{
      id: string
      title: string
      artist: {
        name: {
          display: string
        }
      }
      image: {
        large: string
      }
      dates: {
        original: string
      }
    }>
  }>
}

export interface SearchResponse {
  success: boolean
  data: {
    query: string
    albums: {
      total: number
      items: Album[]
    }
  }
}

export interface AlbumResponse {
  success: boolean
  data: AlbumDetails
}

export interface ArtistResponse {
  success: boolean
  data: {
    artist: Artist
  }
}

export interface StreamResponse {
  success: boolean
  data: {
    url: string
  }
}

export type RepeatMode = "off" | "all" | "one"

export type Theme = "default" | "zinc" | "slate" | "rose" | "custom"
