#!/usr/bin/env python3
# Script para eliminar código duplicado en api.js

# Leer el archivo
with open("js/api.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

# Encontrar y eliminar las líneas duplicadas (464-497)
# Las líneas están 1-indexed en el editor pero 0-indexed en Python
start_line = 463  # línea 464 en el editor (0-indexed)
end_line = 496  # línea 497 en el editor (0-indexed)

# Eliminar las líneas duplicadas
new_lines = lines[:start_line] + lines[end_line + 1 :]

# Guardar
with open("js/api.js", "w", encoding="utf-8") as f:
    f.writelines(new_lines)

print(f"✓ Eliminadas {end_line - start_line + 1} líneas duplicadas (464-497)")
