#!/usr/bin/env python3
# Script para eliminar logs de debug de api.js

import re

# Leer el archivo
with open("js/api.js", "r", encoding="utf-8") as f:
    content = f.read()

# Eliminar las líneas de debug
lines_to_remove = [
    "console.log('[Stream] DEBUG - Item keys:', Object.keys(item));",
    "console.log('[Stream] DEBUG - Item:', JSON.stringify(item, null, 2));",
    "console.log('[Stream] DEBUG - Manifest (first 200 chars):', item.manifest.substring(0, 200));",
    "console.log('[Stream] DEBUG - Manifest type:', typeof item.manifest);",
    "console.log('[Stream] DEBUG - Manifest length:', item.manifest.length);",
]

for line in lines_to_remove:
    # Escapar caracteres especiales para regex
    escaped = re.escape(line)
    # Eliminar la línea con su indentación y salto de línea
    pattern = r"\s*" + escaped + r"\r?\n"
    content = re.sub(pattern, "", content)

# También eliminar el comentario DEBUG
content = re.sub(r"\s*// DEBUG: Ver qué contiene el item completo\r?\n", "", content)

# Guardar
with open("js/api.js", "w", encoding="utf-8") as f:
    f.write(content)

print("✓ Logs de debug eliminados correctamente")
