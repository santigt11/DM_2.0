"use client"

import Image from "next/image"
import type { Album } from "@/lib/types"
import { formatDate } from "@/lib/utils"

interface AlbumCardProps {
  album: Album
  onClick: () => void
}

export const AlbumCard = ({ album, onClick }: AlbumCardProps) => {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col gap-3 rounded-lg p-3 text-left transition-colors hover:bg-accent"
    >
      <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
        <Image
          src={album.image.large || "/placeholder.svg"}
          alt={album.title}
          fill
          className="object-cover transition-transform group-hover:scale-105"
          sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
        />
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="line-clamp-1 font-medium text-foreground">{album.title}</h3>
        <p className="text-sm text-muted-foreground">{album.artist.name}</p>
        <p className="text-xs text-muted-foreground">{formatDate(album.release_date_original)}</p>
      </div>
    </button>
  )
}
