# MultiVenta UY — Sistema de Gestión

Aplicación web para gestionar pedidos, liquidaciones y ganancias del negocio.

---

## PASO 1 — Crear el proyecto en Supabase

1. Ir a https://supabase.com y crear cuenta (gratis)
2. Crear nuevo proyecto → ponerle nombre, elegir región **South America (São Paulo)**
3. Esperar que el proyecto inicie (~2 min)

---

## PASO 2 — Ejecutar el SQL

1. En el panel de Supabase, ir a **SQL Editor** (ícono de base de datos)
2. Hacer clic en **New Query**
3. Copiar el contenido completo de `sql/schema.sql`
4. Pegar y hacer clic en **Run**
5. Debería mostrar "Success. No rows returned"

---

## PASO 3 — Obtener credenciales

1. En Supabase, ir a **Settings** > **API**
2. Copiar:
   - **Project URL** → `https://xxxx.supabase.co`
   - **anon public** (bajo "Project API keys")

---

## PASO 4 — Configurar la app

Abrir el archivo `js/config.js` y reemplazar:

```js
const SUPABASE_URL = 'https://TU_PROJECT_ID.supabase.co';
const SUPABASE_KEY = 'TU_ANON_KEY_PUBLICA';
```

Con tus valores reales. Ejemplo:
```js
const SUPABASE_URL = 'https://abcdefghij.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

---

## PASO 5 — Probar localmente

Opción A — VS Code con Live Server:
1. Instalar extensión **Live Server** en VS Code
2. Abrir la carpeta `webapp/` en VS Code
3. Click derecho en `index.html` → **Open with Live Server**

Opción B — Python (si lo tenés instalado):
```bash
cd webapp
python -m http.server 8080
```
Luego abrir http://localhost:8080

---

## PASO 6 — Publicar en GitHub Pages

1. Crear repositorio en GitHub (puede ser privado)
2. Subir el contenido de la carpeta `webapp/` (NO la carpeta entera, el contenido):
   ```
   index.html
   css/
   js/
   sql/
   ```
3. Ir a **Settings** > **Pages**
4. Source: **Deploy from a branch**
5. Branch: `main` / carpeta: `/ (root)`
6. Guardar → en ~1 minuto tenés la URL pública

La URL quedará como: `https://TU_USUARIO.github.io/TU_REPO/`

---

## CÓMO USAR LA APP

### Registrar un pedido
1. Tab **➕ Nuevo**
2. Seleccionar producto (se auto-completan los precios)
3. Ingresar nombre del cliente y datos
4. Ajustar precios si necesario
5. **Registrar pedido**

### Cambiar estado de un pedido
1. Tab **📋 Pedidos**
2. Tocar el pedido
3. Cambiar estado → **Guardar**
4. Al marcarlo como *Entregado*, se registra la fecha automáticamente

### Ver liquidación semanal
1. Tab **💰 Liquidar**
2. Navegar con ← → para ir a semanas anteriores
3. Ingresar el dinero real recibido de cadetería
4. El sistema muestra si coincide o hay diferencia

### Agregar productos
1. Tab **📦 Productos**
2. **+ Nuevo**
3. Completar nombre, precios y tipo
4. Los productos inactivos no aparecen en el formulario de pedidos

---

## LÓGICA DE CÁLCULOS

```
Para cada semana (pedidos con estado='entregado' y fecha_entrega en esa semana):

total_ventas     = SUMA de precio_venta
total_envios     = SUMA de costo_envio  ← apartar para pagar cadetería
costos_productos = SUMA de costo_producto
ganancia_real    = total_ventas - total_envios - costos_productos

Mi parte   = (costos_productos × 50%) + (ganancia_real × 66%)
Parte socio= (costos_productos × 50%) + (ganancia_real × 34%)

Control depósito:
  Esperado = total_ventas  ← lo que envía cadetería el lunes
  Real     = dinero_recibido_real  ← ingresado manualmente
  Diferencia = Real - Esperado
```

---

## PARA AUTOMATIZACIÓN FUTURA

La base de datos en Supabase puede consultarse desde Python, Node.js, etc.:

```python
from supabase import create_client

client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Ventas de hoy
hoy = "2026-04-14"
res = client.table('pedidos')\
    .select('*')\
    .eq('estado', 'entregado')\
    .eq('fecha_entrega', hoy)\
    .execute()

# Pedidos pendientes
pendientes = client.table('pedidos')\
    .select('*')\
    .eq('estado', 'pendiente')\
    .execute()
```

---

## ESTRUCTURA DE ARCHIVOS

```
webapp/
├── index.html          ← Shell de la app
├── css/
│   └── app.css         ← Todos los estilos
├── js/
│   ├── config.js       ← ⚠️ Tus credenciales van acá
│   └── app.js          ← Toda la lógica
└── sql/
    └── schema.sql      ← SQL para ejecutar en Supabase
```

---

## SOPORTE

Si algo no funciona:
1. Verificar que el SQL se ejecutó sin errores
2. Verificar que `config.js` tiene las credenciales correctas (sin espacios extra)
3. Abrir DevTools (F12) → Console para ver errores
