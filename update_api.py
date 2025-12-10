#!/usr/bin/env python3
# Script para actualizar getStreamUrl en api.js

import re

# Leer el archivo
with open("js/api.js", "r", encoding="utf-8") as f:
    content = f.read()

# Nuevo código para getStreamUrl
new_getStreamUrl = """    async getStreamUrl(id, quality = 'LOSSLESS') {
        // Lista de calidades en orden de prioridad
        const qualities = [quality];
        ['LOSSLESS', 'HIGH', 'LOW', 'HI_RES_LOSSLESS'].forEach(q => {
            if (q !== quality) qualities.push(q);
        });

        const TIMEOUT = 15000;
        
        for (const currentQuality of qualities) {
            try {
                console.log(`[Stream] Trying quality: ${currentQuality}`);
                const response = await this.fetchWithRetry(`/track/?id=${id}&quality=${currentQuality}`, { timeout: TIMEOUT });
                
                if (!response.ok) {
                    console.warn(`[Stream] Response not OK for ${currentQuality}: ${response.status}`);
                    continue;
                }

                const json = await response.json();
                
                // Normalizar la respuesta a un array de items
                let items = [];
                if (json.data) {
                    items = [json.data];
                } else if (Array.isArray(json)) {
                    items = json;
                } else {
                    items = [json];
                }

                console.log(`[Stream] Processing ${items.length} items from response`);

                // 1. Buscar URL directa primero
                for (const item of items) {
                    const directUrl = item.OriginalTrackUrl || item.originalTrackUrl || item.url;
                    if (directUrl && typeof directUrl === 'string' && directUrl.startsWith('http')) {
                        console.log(`[Stream] ✓ Found direct URL (${currentQuality})`);
                        return this.enforceHttps(directUrl);
                    }
                }

                // 2. Intentar decodificar manifest
                for (const item of items) {
                    if (item.manifest) {
                        try {
                            // Normalizar base64 (algunos servidores usan URL-safe base64)
                            const base64 = item.manifest.replace(/-/g, '+').replace(/_/g, '/');
                            const decoded = atob(base64);
                            
                            // Saltar manifests DASH que no tienen BaseURL
                            if (decoded.includes('SegmentTemplate') && !decoded.includes('BaseURL')) {
                                console.log(`[Stream] Skipping DASH manifest without BaseURL`);
                                continue;
                            }

                            const url = this.extractStreamUrlFromManifest(decoded);
                            if (url) {
                                console.log(`[Stream] ✓ Decoded manifest (${currentQuality})`);
                                return url;
                            }
                        } catch (e) {
                            console.warn(`[Stream] Failed to decode manifest:`, e.message);
                            // Intentar extraer sin decodificar
                            const url = this.extractStreamUrlFromManifest(item.manifest);
                            if (url) {
                                console.log(`[Stream] ✓ Extracted from raw manifest (${currentQuality})`);
                                return url;
                            }
                        }
                    }
                }

                console.warn(`[Stream] No playable URL found for quality ${currentQuality}`);
            } catch (error) {
                console.warn(`[Stream] Error with quality ${currentQuality}:`, error.message);
            }
        }

        throw new Error('Failed to resolve a playable stream URL for any quality');
    }

    enforceHttps(url) {
        if (!url) return '';
        return url.replace(/^http:/, 'https:');
    }"""

# Patrón para encontrar getStreamUrl
pattern = (
    r"    async getStreamUrl\(id, quality = \'LOSSLESS\'\) \{[^}]+\{[^}]+\}[^}]+\}"
)

# Reemplazar
new_content = re.sub(pattern, new_getStreamUrl, content, flags=re.DOTALL)

# Guardar
with open("js/api.js", "w", encoding="utf-8") as f:
    f.write(new_content)

print("✓ getStreamUrl actualizado correctamente")
