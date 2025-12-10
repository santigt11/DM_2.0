#!/usr/bin/env python3
# Script para arreglar getAlbum en api.js

import re

# Leer el archivo
with open("js/api.js", "r", encoding="utf-8") as f:
    content = f.read()

# Nuevo código para getAlbum
new_getAlbum = """    async getAlbum(id) {
        const cached = await this.cache.get('album', id);
        if (cached) return cached;

        const response = await this.fetchWithRetry(`/album/?id=${id}`);
        const data = await response.json();
        
        // Normalizar respuesta
        let entries = [];
        let tracksSection = null;
        
        // Caso 1: { version: "2.0", data: { items: [...] } }
        if (data.data && data.data.items && Array.isArray(data.data.items)) {
            tracksSection = data.data;
            entries = []; // No hay entrada de álbum separada
        }
        // Caso 2: { data: {...} } donde data es el álbum
        else if (data.data) {
            entries = [data.data];
        }
        // Caso 3: Array de objetos
        else if (Array.isArray(data)) {
            entries = data;
        }
        // Caso 4: Objeto simple
        else {
            entries = [data];
        }

        let album = null;

        // Buscar álbum en entries
        for (const entry of entries) {
            if (!entry || typeof entry !== 'object') continue;

            // Buscar álbum - más flexible
            if (!album && entry.id && entry.title) {
                // Verificar que parece un álbum (tiene cover, releaseDate, etc.)
                if (entry.cover || entry.numberOfTracks || entry.releaseDate) {
                    album = this.prepareAlbum(entry);
                }
            }

            // Buscar sección de tracks si no la tenemos
            if (!tracksSection && 'items' in entry && Array.isArray(entry.items)) {
                tracksSection = entry;
            }
        }

        // Extraer tracks
        const tracks = (tracksSection?.items || []).map(i => this.prepareTrack(i.item || i));

        // Si no encontramos el álbum pero tenemos tracks, construir álbum desde el primer track
        if (!album && tracks.length > 0) {
            const firstTrack = tracks[0];
            if (firstTrack.album) {
                console.log('[getAlbum] Building album info from first track');
                album = {
                    id: id,
                    title: firstTrack.album.title || 'Unknown Album',
                    cover: firstTrack.album.cover,
                    artist: firstTrack.artist,
                    releaseDate: firstTrack.album.releaseDate,
                    numberOfTracks: tracks.length,
                    duration: tracks.reduce((sum, t) => sum + (t.duration || 0), 0)
                };
            }
        }

        if (!album) {
            console.error('[getAlbum] Response:', JSON.stringify(data, null, 2));
            throw new Error('Album not found');
        }

        const result = { album, tracks };

        await this.cache.set('album', id, result);
        return result;
    }"""

# Patrón para encontrar getAlbum
pattern = r"    async getAlbum\(id\) \{[^}]+\{[^}]+\}[^}]+\{[^}]+\}[^}]+\}"

# Reemplazar
new_content = re.sub(pattern, new_getAlbum, content, flags=re.DOTALL)

# Guardar
with open("js/api.js", "w", encoding="utf-8") as f:
    f.write(new_content)

print("✓ getAlbum actualizado correctamente")
