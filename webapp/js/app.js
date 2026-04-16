/* ============================================================
   MultiVenta UY — app.js
   Vanilla JS + Supabase
   ============================================================ */

'use strict';

// ─────────────────────────────────────────────────────────────
// INICIALIZACIÓN SUPABASE
// ─────────────────────────────────────────────────────────────
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ─────────────────────────────────────────────────────────────
// ESTADO GLOBAL
// ─────────────────────────────────────────────────────────────
const State = {
  view:       'dashboard',
  productos:  [],
  pedidos:    [],
  filtroEstado: '',
  filtroDesde: '',
  filtroHasta: '',
  liqLunes:   getLunesDeHoy(),
  editId:     null,
};

// Carrito temporal para el formulario "Nuevo Pedido"
// { productoId: { id, nombre, precio, costo, gratis, qty } }
let npCart = {};

// ─────────────────────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────────────────────
function fmt(n) {
  if (n == null || n === '') return '$0';
  return '$' + Number(n).toLocaleString('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDec(n) {
  if (n == null) return '$0';
  return '$' + Number(n).toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtFecha(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function hoy() {
  return new Date().toISOString().split('T')[0];
}

function getLunesDeHoy() {
  const d = new Date();
  const day = d.getDay();               // 0=Dom, 1=Lun, ...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getDomingo(lunes) {
  const d = new Date(lunes);
  d.setDate(d.getDate() + 6);
  return d;
}

function toISO(date) {
  return date.toISOString().split('T')[0];
}

function semanaLabel(lunes, domingo) {
  const opt = { day: '2-digit', month: 'short' };
  return `${lunes.toLocaleDateString('es-UY', opt)} — ${domingo.toLocaleDateString('es-UY', opt)}`;
}

function statusLabel(estado) {
  const map = { pendiente: 'Pendiente', enviado: 'Enviado', entregado: 'Entregado', cancelado: 'Cancelado' };
  return map[estado] || estado;
}

function sum(arr, key) {
  return arr.reduce((acc, r) => acc + (parseFloat(r[key]) || 0), 0);
}

// ─────────────────────────────────────────────────────────────
// TARIFAS DE ENVÍO (cadetería Marco Postal)
// ─────────────────────────────────────────────────────────────
const ZONAS = {
  MVD:      { label: 'Montevideo',  envio_cobrado: 199, costo_cadeteria: 244, costo_cancelado: 189.10 },
  CANELONES:{ label: 'Canelones',   envio_cobrado: 285, costo_cadeteria: 317, costo_cancelado: 231.80 },
};

// ─────────────────────────────────────────────────────────────
// CÁLCULOS DE NEGOCIO
// ─────────────────────────────────────────────────────────────
function calcSemana(pedidos, lunesISO, domingoISO) {
  const entregados = pedidos.filter(p =>
    p.estado === 'entregado' &&
    p.fecha_entrega >= lunesISO &&
    p.fecha_entrega <= domingoISO
  );
  const total_ventas     = sum(entregados, 'precio_venta');
  const total_envios     = sum(entregados, 'costo_envio');
  const costos_productos = sum(entregados, 'costo_producto');
  const ganancia_real    = total_ventas - total_envios - costos_productos;
  const mi_parte         = costos_productos * NEGOCIO.costo_split + ganancia_real * NEGOCIO.mi_porcentaje;
  const parte_socio      = costos_productos * NEGOCIO.costo_split + ganancia_real * NEGOCIO.soc_porcentaje;
  return { entregados, total_ventas, total_envios, costos_productos, ganancia_real, mi_parte, parte_socio };
}

// ─────────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────────
function toast(msg, type = 'success', ms = 2800) {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// ─────────────────────────────────────────────────────────────
// MODAL / SHEET
// ─────────────────────────────────────────────────────────────
const UI = {
  openModal(html) {
    const overlay = document.getElementById('modalOverlay');
    const sheet   = document.getElementById('modalSheet');
    const content = document.getElementById('modalContent');
    content.innerHTML = html;
    overlay.style.display = 'flex';
    requestAnimationFrame(() => {
      overlay.classList.add('visible');
      sheet.classList.add('visible');
    });
  },

  closeModal(e) {
    if (e && e.target !== document.getElementById('modalOverlay')) return;
    const overlay = document.getElementById('modalOverlay');
    const sheet   = document.getElementById('modalSheet');
    overlay.classList.remove('visible');
    sheet.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 250);
    State.editId = null;
  },

  forceClose() {
    const overlay = document.getElementById('modalOverlay');
    const sheet   = document.getElementById('modalSheet');
    overlay.classList.remove('visible');
    sheet.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 250);
    State.editId = null;
  }
};

// ─────────────────────────────────────────────────────────────
// BASE DE DATOS
// ─────────────────────────────────────────────────────────────
const DB = {
  async loadProductos() {
    const { data, error } = await db.from('productos').select('*').order('nombre');
    if (error) { console.error(error); return; }
    State.productos = data || [];
  },

  async loadPedidos() {
    const { data, error } = await db
      .from('pedidos')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { console.error(error); return; }
    State.pedidos = data || [];
  },

  async createPedido(payload) {
    const { data, error } = await db.from('pedidos').insert([payload]).select().single();
    if (error) throw error;
    return data;
  },

  async updatePedido(id, payload) {
    const { data, error } = await db.from('pedidos').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async deletePedido(id) {
    const { error } = await db.from('pedidos').delete().eq('id', id);
    if (error) throw error;
  },

  async createProducto(payload) {
    const { data, error } = await db.from('productos').insert([payload]).select().single();
    if (error) throw error;
    return data;
  },

  async updateProducto(id, payload) {
    const { data, error } = await db.from('productos').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async getLiquidacion(lunesISO) {
    const { data } = await db.from('liquidaciones').select('*').eq('semana_inicio', lunesISO).single();
    return data;
  },

  async upsertLiquidacion(payload) {
    const { data, error } = await db.from('liquidaciones').upsert(payload, { onConflict: 'semana_inicio' }).select().single();
    if (error) throw error;
    return data;
  },
};

// ─────────────────────────────────────────────────────────────
// RENDER: DASHBOARD
// ─────────────────────────────────────────────────────────────
function renderDashboard() {
  const hoyISO   = hoy();
  const lunes    = getLunesDeHoy();
  const domingo  = getDomingo(lunes);
  const lunesISO = toISO(lunes);
  const domISO   = toISO(domingo);

  const pedidosHoy      = State.pedidos.filter(p => p.fecha_pedido === hoyISO);
  const entregadosHoy   = State.pedidos.filter(p => p.estado === 'entregado' && p.fecha_entrega === hoyISO);
  const pendientesTotal = State.pedidos.filter(p => p.estado === 'pendiente');

  const { total_ventas, ganancia_real, entregados: entSemana } = calcSemana(State.pedidos, lunesISO, domISO);

  const recientes = State.pedidos.slice(0, 6);

  const content = document.getElementById('app-content');
  content.innerHTML = `
    <div class="view">
      <p class="text-sm text-muted mb-4">
        ${new Date().toLocaleDateString('es-UY', { weekday:'long', day:'numeric', month:'long' })}
      </p>

      <!-- Stats principales -->
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">Pedidos hoy</div>
          <div class="stat-value">${pedidosHoy.length}</div>
          <div class="stat-sub">${entregadosHoy.length} entregados</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Pendientes</div>
          <div class="stat-value warning">${pendientesTotal.length}</div>
          <div class="stat-sub">sin enviar</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Ventas semana</div>
          <div class="stat-value primary">${fmt(total_ventas)}</div>
          <div class="stat-sub">${entSemana.length} entregados</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Ganancia semana</div>
          <div class="stat-value success">${fmt(ganancia_real)}</div>
          <div class="stat-sub">mi parte: ${fmt(ganancia_real * NEGOCIO.mi_porcentaje)}</div>
        </div>
      </div>

      <!-- Publicidad pendiente -->
      <div id="publicidad-card" class="card mt-12" style="border-left:4px solid #f97316">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <div class="stat-label" style="margin-bottom:4px">Publicidad pendiente de pago</div>
            <div id="publicidad-monto" class="stat-value" style="color:#f97316;font-size:1.6rem">
              Cargando...
            </div>
            <div id="publicidad-sub" class="stat-sub"></div>
          </div>
          <div style="font-size:2rem;opacity:.7">📢</div>
        </div>
      </div>

      <!-- Stock Marco Postal -->
      <div id="stock-card" class="card mt-12" style="border-left:4px solid #6366f1">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div class="stat-label" style="margin:0;font-weight:600">Stock en Marco Postal</div>
          <div style="font-size:1.4rem;opacity:.7">📦</div>
        </div>
        <div id="stock-body"><div class="text-sm text-muted">Cargando...</div></div>
        <div id="stock-actualizado" class="stat-sub" style="margin-top:6px"></div>
      </div>

      <!-- Botón rápido -->
      <button class="btn btn-primary btn-block mt-12" onclick="navigate('nuevo')">
        ➕ &nbsp; Nuevo pedido
      </button>

      <!-- Recientes -->
      <div class="section-title" style="margin-top:20px">Últimos pedidos</div>
      ${recientes.length === 0
        ? `<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-text">No hay pedidos aún</div></div>`
        : recientes.map(renderPedidoCard).join('')
      }
    </div>
  `;

  // Eventos de cards
  attachPedidoCardEvents();

  // Cargar datos asíncronos
  _cargarPublicidadSaldo();
  _cargarStock();
}

async function _cargarPublicidadSaldo() {
  try {
    const { data, error } = await db
      .from('publicidad_saldo')
      .select('saldo_pendiente, gasto_hoy, gasto_acumulado, actualizado_at, fecha')
      .order('fecha', { ascending: false })
      .limit(1)
      .single();

    const montoEl = document.getElementById('publicidad-monto');
    const subEl   = document.getElementById('publicidad-sub');
    if (!montoEl) return; // usuario navegó antes de que cargue

    if (error || !data) {
      montoEl.textContent = '$0';
      if (subEl) subEl.textContent = 'Sin datos aún — se actualiza a las 23:55';
      return;
    }

    const saldo = parseFloat(data.saldo_pendiente) || 0;
    montoEl.textContent = fmt(saldo);

    if (subEl) {
      const actualizadoAt = data.actualizado_at
        ? new Date(data.actualizado_at).toLocaleDateString('es-UY', { day:'2-digit', month:'short' })
        : data.fecha || '';
      subEl.textContent = `Gasto hoy: ${fmt(data.gasto_hoy)} | Actualizado: ${actualizadoAt}`;
    }

    // Si no hay saldo, cambiar borde a verde
    if (saldo === 0) {
      const card = document.getElementById('publicidad-card');
      if (card) card.style.borderLeftColor = '#22c55e';
    }
  } catch (e) {
    const montoEl = document.getElementById('publicidad-monto');
    if (montoEl) montoEl.textContent = '$—';
  }
}

async function _cargarStock() {
  try {
    const { data, error } = await db
      .from('stock_mp')
      .select('codigo, articulo, stock, stock_total, actualizado_at')
      .order('articulo', { ascending: true });

    const bodyEl  = document.getElementById('stock-body');
    const actEl   = document.getElementById('stock-actualizado');
    if (!bodyEl) return;

    if (error || !data || data.length === 0) {
      bodyEl.innerHTML = '<div class="text-sm text-muted">Sin datos — se actualiza a las 17:00</div>';
      return;
    }

    const rows = data.map(p => {
      const s = p.stock;
      const color  = s <= 3  ? '#ef4444' : s <= 8 ? '#f97316' : '#22c55e';
      const emoji  = s <= 3  ? '🔴' : s <= 8 ? '🟡' : '🟢';
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;
                    padding:6px 0;border-bottom:1px solid var(--border)">
          <div class="text-sm">${emoji} ${p.articulo}</div>
          <div style="font-weight:700;color:${color};font-size:.95rem">${s} <span class="text-muted" style="font-weight:400;font-size:.8rem">/ ${p.stock_total}</span></div>
        </div>`;
    }).join('');

    bodyEl.innerHTML = rows;

    if (actEl && data[0].actualizado_at) {
      const d = new Date(data[0].actualizado_at);
      actEl.textContent = `Actualizado: ${d.toLocaleDateString('es-UY', {day:'2-digit',month:'short'})} ${d.toLocaleTimeString('es-UY',{hour:'2-digit',minute:'2-digit'})}`;
    }

    // Cambiar borde del card según el peor estado
    const minStock = Math.min(...data.map(p => p.stock));
    const card = document.getElementById('stock-card');
    if (card) {
      card.style.borderLeftColor = minStock <= 3 ? '#ef4444' : minStock <= 8 ? '#f97316' : '#22c55e';
    }
  } catch(e) {
    const bodyEl = document.getElementById('stock-body');
    if (bodyEl) bodyEl.innerHTML = '<div class="text-sm text-muted">Error al cargar stock</div>';
  }
}

// ─────────────────────────────────────────────────────────────
// RENDER: LISTA DE PEDIDOS
// ─────────────────────────────────────────────────────────────
function renderPedidos() {
  let pedidos = [...State.pedidos];

  if (State.filtroEstado)
    pedidos = pedidos.filter(p => p.estado === State.filtroEstado);
  if (State.filtroDesde)
    pedidos = pedidos.filter(p => p.fecha_pedido >= State.filtroDesde);
  if (State.filtroHasta)
    pedidos = pedidos.filter(p => p.fecha_pedido <= State.filtroHasta);

  const estados = ['', 'pendiente', 'enviado', 'entregado', 'cancelado'];

  document.getElementById('app-content').innerHTML = `
    <div class="view">
      <!-- Filtros de estado -->
      <div class="filter-pills">
        ${estados.map(e => `
          <button class="pill ${State.filtroEstado === e ? 'active' : ''}"
            onclick="setFiltroEstado('${e}')">
            ${e === '' ? 'Todos' : statusLabel(e)}
          </button>`).join('')}
      </div>

      <!-- Filtro de fecha -->
      <div class="card" style="padding:12px">
        <div class="form-row">
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">Desde</label>
            <input type="date" class="form-control" id="filtroDesde"
              value="${State.filtroDesde}"
              onchange="setFiltroFecha('desde', this.value)">
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">Hasta</label>
            <input type="date" class="form-control" id="filtroHasta"
              value="${State.filtroHasta}"
              onchange="setFiltroFecha('hasta', this.value)">
          </div>
        </div>
        ${(State.filtroDesde || State.filtroHasta)
          ? `<button class="btn btn-ghost btn-sm mt-8" onclick="limpiarFechas()">✕ Limpiar fechas</button>`
          : ''}
      </div>

      <!-- Contador -->
      <p class="text-sm text-muted mb-4">${pedidos.length} pedido${pedidos.length !== 1 ? 's' : ''}</p>

      <!-- Lista -->
      ${pedidos.length === 0
        ? `<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-text">Sin resultados</div></div>`
        : pedidos.map(renderPedidoCard).join('')
      }
    </div>
  `;

  attachPedidoCardEvents();
}

function renderPedidoCard(p) {
  return `
    <div class="pedido-card" data-id="${p.id}">
      <div>
        <div class="pedido-nombre">${escHtml(p.nombre_cliente)}</div>
        <div class="pedido-producto">${escHtml(p.nombre_producto)}</div>
        <div class="pedido-meta">
          Pedido: ${fmtFecha(p.fecha_pedido)}
          ${p.fecha_entrega ? ` · Entrega: ${fmtFecha(p.fecha_entrega)}` : ''}
          ${p.guia_mp ? ` · <strong>Guía #${escHtml(p.guia_mp)}</strong>` : ''}
        </div>
      </div>
      <div>
        <div class="pedido-precio">${fmt(p.precio_venta)}</div>
        <div class="text-right mt-8">
          <span class="badge badge-${p.estado}">${statusLabel(p.estado)}</span>
        </div>
      </div>
    </div>
  `;
}

function attachPedidoCardEvents() {
  document.querySelectorAll('.pedido-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      const pedido = State.pedidos.find(p => p.id === id);
      if (pedido) openEditPedido(pedido);
    });
  });
}

// ─────────────────────────────────────────────────────────────
// MODAL: EDITAR PEDIDO
// ─────────────────────────────────────────────────────────────
function openEditPedido(p) {
  State.editId = p.id;
  const estados = ['pendiente', 'enviado', 'entregado', 'cancelado'];

  UI.openModal(`
    <div class="sheet-title">Editar Pedido</div>
    <p class="fw-700">${escHtml(p.nombre_cliente)}</p>
    <p class="text-sm text-muted mb-4">${escHtml(p.nombre_producto)} · ${fmt(p.precio_venta)}</p>
    <div class="divider"></div>

    <div class="form-group">
      <label class="form-label">Estado</label>
      <select class="form-control" id="edit_estado">
        ${estados.map(e =>
          `<option value="${e}" ${p.estado === e ? 'selected' : ''}>${statusLabel(e)}</option>`
        ).join('')}
      </select>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Fecha pedido</label>
        <input type="date" class="form-control" id="edit_fecha_pedido" value="${p.fecha_pedido || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Fecha entrega</label>
        <input type="date" class="form-control" id="edit_fecha_entrega" value="${p.fecha_entrega || ''}">
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Cliente</label>
      <input type="text" class="form-control" id="edit_nombre_cliente" value="${escHtml(p.nombre_cliente)}">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Teléfono</label>
        <input type="tel" class="form-control" id="edit_telefono" value="${escHtml(p.telefono || '')}">
      </div>
      <div class="form-group">
        <label class="form-label">Precio venta</label>
        <input type="number" class="form-control" id="edit_precio_venta" value="${p.precio_venta}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Costo cadetería</label>
        <input type="number" class="form-control" id="edit_costo_envio" value="${p.costo_envio}">
      </div>
      <div class="form-group">
        <label class="form-label">Costo producto</label>
        <input type="number" class="form-control" id="edit_costo_producto" value="${p.costo_producto}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Dirección</label>
      <input type="text" class="form-control" id="edit_direccion" value="${escHtml(p.direccion || '')}">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Nro. de guía MP</label>
        <input type="text" class="form-control" id="edit_guia_mp" value="${escHtml(p.guia_mp || '')}" placeholder="sin guía">
      </div>
      <div class="form-group">
        <label class="form-label">Producto</label>
        <input type="text" class="form-control" id="edit_nombre_producto" value="${escHtml(p.nombre_producto || '')}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Notas</label>
      <textarea class="form-control" id="edit_notas" rows="2">${escHtml(p.notas || '')}</textarea>
    </div>

    <div class="divider"></div>
    <div class="flex gap-8">
      <button class="btn btn-primary" style="flex:1" onclick="guardarEditPedido()">Guardar</button>
      <button class="btn btn-danger btn-icon" onclick="confirmarEliminar('${p.id}')">🗑</button>
    </div>
  `);
}

async function guardarEditPedido() {
  const id = State.editId;
  if (!id) return;
  const payload = {
    estado:          document.getElementById('edit_estado').value,
    fecha_pedido:    document.getElementById('edit_fecha_pedido').value || null,
    fecha_entrega:   document.getElementById('edit_fecha_entrega').value || null,
    nombre_cliente:  document.getElementById('edit_nombre_cliente').value.trim(),
    telefono:        document.getElementById('edit_telefono').value.trim(),
    precio_venta:    parseFloat(document.getElementById('edit_precio_venta').value) || 0,
    costo_envio:     parseFloat(document.getElementById('edit_costo_envio').value) || 0,
    costo_producto:  parseFloat(document.getElementById('edit_costo_producto').value) || 0,
    direccion:       document.getElementById('edit_direccion').value.trim(),
    guia_mp:         document.getElementById('edit_guia_mp').value.trim() || null,
    nombre_producto: document.getElementById('edit_nombre_producto').value.trim(),
    notas:           document.getElementById('edit_notas').value.trim(),
  };

  // Auto-set fecha_entrega si se marca entregado
  if (payload.estado === 'entregado' && !payload.fecha_entrega) {
    payload.fecha_entrega = hoy();
  }

  try {
    const updated = await DB.updatePedido(id, payload);
    const idx = State.pedidos.findIndex(p => p.id === id);
    if (idx >= 0) State.pedidos[idx] = updated;
    UI.forceClose();
    toast('Pedido actualizado ✓');
    renderView();
  } catch (e) {
    toast('Error al guardar: ' + e.message, 'error');
  }
}

async function confirmarEliminar(id) {
  if (!confirm('¿Eliminar este pedido? No se puede deshacer.')) return;
  try {
    await DB.deletePedido(id);
    State.pedidos = State.pedidos.filter(p => p.id !== id);
    UI.forceClose();
    toast('Pedido eliminado');
    renderView();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

// ─────────────────────────────────────────────────────────────
// RENDER: NUEVO PEDIDO
// ─────────────────────────────────────────────────────────────
function renderNuevo() {
  npCart = {}; // resetear carrito al entrar
  const activos = State.productos.filter(p => p.activo);

  document.getElementById('app-content').innerHTML = `
    <div class="view">
      <div class="section-title" style="margin-top:4px">Seleccioná los productos</div>
      <div class="prod-selector" id="prodSelector">
        ${activos.map(p => `
          <div class="prod-option" data-id="${p.id}"
            data-precio="${p.precio_venta}"
            data-costo="${p.costo_producto}"
            data-nombre="${escHtml(p.nombre)}"
            data-gratis="${p.envio_gratis ? '1' : '0'}"
            onclick="addToCart(this)">
            <div class="prod-option-name">${escHtml(p.nombre)}</div>
            <div style="display:flex;align-items:center;gap:6px;justify-content:center;flex-wrap:wrap">
              <div class="prod-option-price">${fmt(p.precio_venta)}</div>
              ${p.envio_gratis ? '<span class="badge-envio-gratis">ENVÍO GRATIS</span>' : ''}
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Carrito de productos seleccionados -->
      <div id="cart-section"></div>

      <!-- Panel de envío (se actualiza al cambiar zona o producto) -->
      <div id="envio-panel" class="envio-panel"></div>

      <div class="section-title">Datos del cliente</div>
      <div class="card" style="padding:14px">
        <!-- Zona -->
        <div class="form-group">
          <label class="form-label">Zona de entrega</label>
          <div class="zona-selector">
            ${Object.entries(ZONAS).map(([key, z]) => `
              <label class="zona-option">
                <input type="radio" name="np_zona" value="${key}" ${key === 'MVD' ? 'checked' : ''}
                  onchange="actualizarZona()">
                <div class="zona-btn">
                  <div class="zona-nombre">${z.label}</div>
                  <div class="zona-detalle">
                    <span class="zona-cobra">cobra ${fmt(z.envio_cobrado)}</span>
                    <span class="zona-paga">paga ${fmt(z.costo_cadeteria)}</span>
                  </div>
                </div>
              </label>
            `).join('')}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Nombre <span class="req">*</span></label>
          <input type="text" class="form-control" id="np_cliente" placeholder="Ej: Ana García"
            autocomplete="name">
        </div>
        <div class="form-row">
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">Teléfono</label>
            <input type="tel" class="form-control" id="np_telefono" placeholder="09X XXX XXX"
              autocomplete="tel">
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">Fecha pedido</label>
            <input type="date" class="form-control" id="np_fecha" value="${hoy()}">
          </div>
        </div>
        <div class="form-group mt-12">
          <label class="form-label">Dirección</label>
          <input type="text" class="form-control" id="np_direccion" placeholder="Calle y número"
            autocomplete="street-address">
        </div>
      </div>

      <div class="section-title">Precios</div>
      <div class="card" style="padding:14px">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Precio venta <span class="req">*</span>
              <span class="form-hint" id="np_precio_hint"></span>
            </label>
            <input type="number" class="form-control" id="np_precio" placeholder="0" inputmode="numeric">
          </div>
          <div class="form-group">
            <label class="form-label">Costo producto</label>
            <input type="number" class="form-control" id="np_costo" placeholder="0" inputmode="numeric">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">Costo cadetería</label>
            <input type="number" class="form-control" id="np_envio" placeholder="0" inputmode="numeric" readonly
              style="background:var(--gray-100);color:var(--gray-500)">
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">Envío cobrado al cliente</label>
            <input type="number" class="form-control" id="np_envio_cobrado" placeholder="0" inputmode="numeric" readonly
              style="background:var(--gray-100);color:var(--gray-500)">
          </div>
        </div>
        <div class="form-row" style="margin-top:10px">
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">Estado inicial</label>
            <select class="form-control" id="np_estado">
              <option value="pendiente">Pendiente</option>
              <option value="enviado">Enviado</option>
              <option value="entregado">Entregado</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">Nro. de guía MP</label>
            <input type="text" class="form-control" id="np_guia" placeholder="opcional">
          </div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Notas</label>
        <textarea class="form-control" id="np_notas" rows="2" placeholder="Observaciones opcionales..."></textarea>
      </div>

      <button class="btn btn-primary btn-block" onclick="submitNuevoPedido()" id="btnSubmit">
        Registrar pedido
      </button>
    </div>
  `;

  // Seleccionar primer producto por defecto
  const first = document.querySelector('.prod-option');
  if (first) selectProducto(first);
}

function getZonaSeleccionada() {
  const radio = document.querySelector('input[name="np_zona"]:checked');
  return radio ? radio.value : 'MVD';
}

function addToCart(el) {
  const id = el.dataset.id;
  if (!npCart[id]) {
    npCart[id] = {
      id,
      nombre: el.dataset.nombre,
      precio: parseFloat(el.dataset.precio) || 0,
      costo:  parseFloat(el.dataset.costo)  || 0,
      gratis: el.dataset.gratis === '1',
      qty:    0,
    };
  }
  npCart[id].qty++;
  _refreshCart();
}

function changeQty(id, delta) {
  if (!npCart[id]) return;
  npCart[id].qty = Math.max(0, npCart[id].qty + delta);
  if (npCart[id].qty === 0) delete npCart[id];
  _refreshCart();
}

function _refreshCart() {
  // Actualizar badges en las tarjetas de producto
  document.querySelectorAll('.prod-option').forEach(el => {
    const id  = el.dataset.id;
    const qty = npCart[id]?.qty || 0;
    el.classList.toggle('selected', qty > 0);
    let badge = el.querySelector('.cart-qty-badge');
    if (qty > 0) {
      if (!badge) { badge = document.createElement('div'); badge.className = 'cart-qty-badge'; el.appendChild(badge); }
      badge.textContent = `×${qty}`;
    } else if (badge) {
      badge.remove();
    }
  });

  const items  = Object.values(npCart).filter(i => i.qty > 0);
  const cartEl = document.getElementById('cart-section');
  if (!cartEl) return;

  if (items.length === 0) {
    cartEl.innerHTML = '';
    ['np_precio','np_costo','np_envio','np_envio_cobrado'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    const p = document.getElementById('envio-panel'); if (p) p.innerHTML = '';
    return;
  }

  const totalCosto = items.reduce((s, i) => s + i.costo * i.qty, 0);
  document.getElementById('np_costo').value = totalCosto;

  cartEl.innerHTML = `
    <div class="cart-box">
      <div class="cart-title">Carrito</div>
      ${items.map(i => `
        <div class="cart-item">
          <div class="cart-item-name">${escHtml(i.nombre)}${i.gratis ? ' <span class="badge-envio-gratis" style="font-size:.65rem;padding:1px 6px">GRATIS</span>' : ''}</div>
          <div class="cart-item-controls">
            <button class="cart-qty-btn" onclick="changeQty('${i.id}', -1)">−</button>
            <span class="cart-qty-num">${i.qty}</span>
            <button class="cart-qty-btn" onclick="changeQty('${i.id}', +1)">+</button>
            <span class="cart-item-price">${fmt(i.precio * i.qty)}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  actualizarZona();
}

function actualizarZona() {
  const items = Object.values(npCart).filter(i => i.qty > 0);
  if (items.length === 0) return;

  const zona      = getZonaSeleccionada();
  const z         = ZONAS[zona];
  const anyGratis = items.some(i => i.gratis);
  const totalProd = items.reduce((s, i) => s + i.precio * i.qty, 0);
  const totalCosto= items.reduce((s, i) => s + i.costo  * i.qty, 0);

  // Precio venta al cliente
  const precioFinal = anyGratis ? totalProd : totalProd + z.envio_cobrado;

  document.getElementById('np_precio').value        = precioFinal;
  document.getElementById('np_envio').value         = z.costo_cadeteria;
  document.getElementById('np_envio_cobrado').value = anyGratis ? 0 : z.envio_cobrado;

  // Hint de precio
  const hintEl = document.getElementById('np_precio_hint');
  if (hintEl) {
    hintEl.textContent = anyGratis
      ? `(productos ${fmt(totalProd)} — sin envío)`
      : `(productos ${fmt(totalProd)} + envío ${fmt(z.envio_cobrado)})`;
  }

  // Panel informativo de envío
  const panelEl = document.getElementById('envio-panel');
  if (!panelEl) return;

  const ganBase = totalProd - totalCosto - z.costo_cadeteria;

  panelEl.innerHTML = esGratis
    ? `<div class="envio-gratis-banner">
        <span class="badge-envio-gratis" style="font-size:.9rem;padding:4px 12px">ENVÍO GRATIS</span>
        <div class="envio-gratis-detalle">
          El cliente no paga envío. Cadetería cobra <strong>${fmt(z.costo_cadeteria)}</strong>
          (sale del margen del combo)
        </div>
        <div class="envio-costos-row">
          <div class="envio-costo-item">
            <div class="envio-costo-label">Cliente paga envío</div>
            <div class="envio-costo-value text-success">$0</div>
          </div>
          <div class="envio-costo-item">
            <div class="envio-costo-label">Costo cadetería</div>
            <div class="envio-costo-value text-danger">${fmt(z.costo_cadeteria)}</div>
          </div>
          <div class="envio-costo-item">
            <div class="envio-costo-label">Si cancela</div>
            <div class="envio-costo-value text-danger">${fmt(z.costo_cancelado)}</div>
          </div>
          <div class="envio-costo-item">
            <div class="envio-costo-label">Ganancia estimada</div>
            <div class="envio-costo-value ${ganBase >= 0 ? 'text-success' : 'text-danger'}">${fmt(ganBase)}</div>
          </div>
        </div>
      </div>`
    : `<div class="envio-info-panel">
        <div class="envio-costos-row">
          <div class="envio-costo-item">
            <div class="envio-costo-label">Cliente paga envío</div>
            <div class="envio-costo-value">${fmt(z.envio_cobrado)}</div>
          </div>
          <div class="envio-costo-item">
            <div class="envio-costo-label">Costo cadetería</div>
            <div class="envio-costo-value text-danger">${fmt(z.costo_cadeteria)}</div>
          </div>
          <div class="envio-costo-item">
            <div class="envio-costo-label">Pérdida envío</div>
            <div class="envio-costo-value text-danger">${fmt(z.envio_cobrado - z.costo_cadeteria)}</div>
          </div>
          <div class="envio-costo-item">
            <div class="envio-costo-label">Si cancela</div>
            <div class="envio-costo-value text-danger">${fmt(z.costo_cancelado)}</div>
          </div>
        </div>
      </div>`;
}

async function submitNuevoPedido() {
  const items   = Object.values(npCart).filter(i => i.qty > 0);
  const cliente = document.getElementById('np_cliente').value.trim();
  const precio  = parseFloat(document.getElementById('np_precio').value) || 0;

  if (!cliente)         { toast('Ingresá el nombre del cliente', 'error'); return; }
  if (items.length === 0) { toast('Seleccioná al menos un producto', 'error'); return; }
  if (!precio)          { toast('Ingresá el precio de venta', 'error'); return; }

  const btn = document.getElementById('btnSubmit');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  const estado = document.getElementById('np_estado').value;
  const zona   = getZonaSeleccionada();

  // Nombre del producto: "Combo Express + Colador ×2"
  const nombreProducto = items
    .map(i => i.qty > 1 ? `${i.nombre} ×${i.qty}` : i.nombre)
    .join(' + ');
  const totalCosto = items.reduce((s, i) => s + i.costo * i.qty, 0);

  const payload = {
    fecha_pedido:    document.getElementById('np_fecha').value,
    fecha_entrega:   estado === 'entregado' ? document.getElementById('np_fecha').value : null,
    nombre_cliente:  cliente,
    telefono:        document.getElementById('np_telefono').value.trim(),
    direccion:       document.getElementById('np_direccion').value.trim(),
    producto_id:     items.length === 1 ? items[0].id : null,
    nombre_producto: nombreProducto,
    precio_venta:    precio,
    costo_envio:     parseFloat(document.getElementById('np_envio').value) || 0,
    costo_producto:  totalCosto,
    envio_cobrado:   parseFloat(document.getElementById('np_envio_cobrado').value) || 0,
    departamento:    zona,
    guia_mp:         document.getElementById('np_guia').value.trim() || null,
    estado:          estado,
    notas:           document.getElementById('np_notas').value.trim(),
  };

  try {
    const nuevo = await DB.createPedido(payload);
    State.pedidos.unshift(nuevo);
    toast('Pedido registrado ✓');
    navigate('pedidos');
  } catch (e) {
    toast('Error: ' + e.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Registrar pedido';
  }
}

// ─────────────────────────────────────────────────────────────
// RENDER: LIQUIDACIÓN
// ─────────────────────────────────────────────────────────────
async function renderLiquidacion() {
  const lunes   = State.liqLunes;
  const domingo = getDomingo(lunes);
  const lunesISO = toISO(lunes);
  const domISO   = toISO(domingo);

  const calc = calcSemana(State.pedidos, lunesISO, domISO);
  const liqData = await DB.getLiquidacion(lunesISO);
  const recibido = liqData?.dinero_recibido_real ?? '';

  // Diferencia
  let diffHtml = '';
  if (recibido !== '' && recibido !== null) {
    const diff = parseFloat(recibido) - calc.total_ventas;
    const cls  = Math.abs(diff) < 1 ? 'ok' : 'alerta';
    const icon = Math.abs(diff) < 1 ? '✅' : '⚠️';
    const label = diff > 0 ? `Recibiste $${fmt(diff)} de más` : diff < 0 ? `Faltaron ${fmt(Math.abs(diff))}` : 'Coincide exactamente';
    diffHtml = `<div class="deposito-diff ${cls}">${icon} ${label}</div>`;
  }

  document.getElementById('app-content').innerHTML = `
    <div class="view">
      <!-- Navegación de semana -->
      <div class="liq-week-nav">
        <button class="btn btn-ghost btn-sm" onclick="navSemana(-1)">← Anterior</button>
        <div class="liq-week-label">${semanaLabel(lunes, domingo)}</div>
        <button class="btn btn-ghost btn-sm" onclick="navSemana(1)">Siguiente →</button>
      </div>

      <!-- Totales -->
      <div class="liq-totales">
        <div class="liq-card azul">
          <div class="liq-card-label">Total ventas</div>
          <div class="liq-card-value">${fmt(calc.total_ventas)}</div>
          <div class="liq-card-sub">${calc.entregados.length} pedidos</div>
        </div>
        <div class="liq-card naranja">
          <div class="liq-card-label">Apartar envíos</div>
          <div class="liq-card-value">${fmt(calc.total_envios)}</div>
          <div class="liq-card-sub">a pagar cadetería</div>
        </div>
        <div class="liq-card rojo">
          <div class="liq-card-label">Costos productos</div>
          <div class="liq-card-value">${fmt(calc.costos_productos)}</div>
          <div class="liq-card-sub">50% cada uno</div>
        </div>
        <div class="liq-card verde">
          <div class="liq-card-label">Ganancia real</div>
          <div class="liq-card-value">${fmt(calc.ganancia_real)}</div>
          <div class="liq-card-sub">neta del negocio</div>
        </div>
      </div>

      <!-- Distribución -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Distribución</span>
        </div>
        <div class="flex justify-between items-center" style="padding:6px 0; border-bottom:1px solid var(--gray-100)">
          <div>
            <div class="fw-700">Mi parte (66%)</div>
            <div class="text-sm text-muted">${fmt(calc.costos_productos * 0.5)} costos + ${fmt(calc.ganancia_real * 0.66)} ganancia</div>
          </div>
          <div class="stat-value success">${fmt(calc.mi_parte)}</div>
        </div>
        <div class="flex justify-between items-center" style="padding:6px 0">
          <div>
            <div class="fw-700">Socio (34%)</div>
            <div class="text-sm text-muted">${fmt(calc.costos_productos * 0.5)} costos + ${fmt(calc.ganancia_real * 0.34)} ganancia</div>
          </div>
          <div class="stat-value primary">${fmt(calc.parte_socio)}</div>
        </div>
      </div>

      <!-- Control de depósito -->
      <div class="deposito-card">
        <div class="deposito-title">💳 Control depósito cadetería</div>
        <p class="text-sm text-muted mb-4">Esperado a recibir el lunes: <strong>${fmt(calc.total_ventas)}</strong></p>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">Dinero recibido real</label>
          <input type="number" class="form-control" id="inputRecibido"
            value="${recibido}"
            placeholder="${fmt(calc.total_ventas)}"
            inputmode="numeric"
            oninput="calcDiff(${calc.total_ventas})">
        </div>
        ${diffHtml}
        <button class="btn btn-primary btn-sm mt-8" onclick="guardarDepositoLiq('${lunesISO}', '${domISO}')">
          Guardar
        </button>
      </div>

      <!-- Notas -->
      <div class="form-group">
        <label class="form-label">Notas de la semana</label>
        <textarea class="form-control" id="liqNotas" rows="2"
          placeholder="Ej: faltó depósito de tal pedido...">${escHtml(liqData?.notas || '')}</textarea>
      </div>

      <!-- Pedidos de la semana -->
      <div class="section-title">Pedidos entregados esta semana</div>
      ${calc.entregados.length === 0
        ? `<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-text">Sin pedidos entregados esta semana</div></div>`
        : `<div class="card" style="padding:12px;overflow-x:auto">
          <table class="mini-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Producto</th>
                <th class="text-right">Venta</th>
                <th class="text-right">Cobrado envío</th>
                <th class="text-right">Costo cad.</th>
                <th class="text-right">Ganancia</th>
              </tr>
            </thead>
            <tbody>
              ${calc.entregados.map(p => {
                const gan = p.precio_venta - p.costo_envio - p.costo_producto;
                const envCobrado = p.envio_cobrado ?? p.costo_envio;
                const esGratis = envCobrado === 0 && p.costo_envio > 0;
                return `<tr>
                  <td>${escHtml(p.nombre_cliente)}</td>
                  <td class="text-muted">
                    ${escHtml(p.nombre_producto)}
                    ${esGratis ? '<span class="badge-envio-gratis" style="font-size:.65rem;padding:1px 5px">GRATIS</span>' : ''}
                  </td>
                  <td class="text-right fw-700">${fmt(p.precio_venta)}</td>
                  <td class="text-right ${esGratis ? 'text-success fw-700' : 'text-muted'}">${esGratis ? '$0' : fmt(envCobrado)}</td>
                  <td class="text-right text-danger">${fmt(p.costo_envio)}</td>
                  <td class="text-right ${gan >= 0 ? 'text-success' : 'text-danger'} fw-700">${fmt(gan)}</td>
                </tr>`;
              }).join('')}
              <tr style="border-top:2px solid var(--gray-200)">
                <td colspan="2" class="fw-700">TOTAL</td>
                <td class="text-right fw-700">${fmt(calc.total_ventas)}</td>
                <td class="text-right text-muted">${fmt(calc.entregados.reduce((s,p)=>s+(p.envio_cobrado??p.costo_envio),0))}</td>
                <td class="text-right text-danger fw-700">${fmt(calc.total_envios)}</td>
                <td class="text-right fw-700 text-success">${fmt(calc.ganancia_real)}</td>
              </tr>
            </tbody>
          </table>
        </div>`
      }
    </div>
  `;
}

function calcDiff(esperado) {
  const val = parseFloat(document.getElementById('inputRecibido').value);
  let html = '';
  if (!isNaN(val)) {
    const diff = val - esperado;
    const cls  = Math.abs(diff) < 1 ? 'ok' : 'alerta';
    const icon = Math.abs(diff) < 1 ? '✅' : '⚠️';
    const label = diff > 0 ? `Recibiste ${fmt(diff)} de más` : diff < 0 ? `Faltaron ${fmt(Math.abs(diff))}` : 'Coincide exactamente';
    html = `<div class="deposito-diff ${cls}">${icon} ${label}</div>`;
  }
  // Actualizar diff en el DOM sin re-renderizar todo
  const existing = document.querySelector('.deposito-diff');
  const parent = document.getElementById('inputRecibido').parentNode;
  if (existing) existing.outerHTML = html;
  else if (html) parent.insertAdjacentHTML('afterend', html);
}

async function guardarDepositoLiq(lunesISO, domISO) {
  const recibido = document.getElementById('inputRecibido').value;
  const notas    = document.getElementById('liqNotas').value.trim();
  try {
    await DB.upsertLiquidacion({
      semana_inicio:       lunesISO,
      semana_fin:          domISO,
      dinero_recibido_real: recibido !== '' ? parseFloat(recibido) : null,
      notas:               notas || null,
    });
    toast('Liquidación guardada ✓');
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

function navSemana(dir) {
  State.liqLunes.setDate(State.liqLunes.getDate() + dir * 7);
  renderView();
}

// ─────────────────────────────────────────────────────────────
// RENDER: PRODUCTOS
// ─────────────────────────────────────────────────────────────
function renderProductos() {
  const activos  = State.productos.filter(p => p.activo);
  const inactivos = State.productos.filter(p => !p.activo);

  document.getElementById('app-content').innerHTML = `
    <div class="view">
      <div class="flex justify-between items-center mb-4">
        <div class="section-title" style="margin:0">${State.productos.length} productos</div>
        <button class="btn btn-primary btn-sm" onclick="openFormProducto()">+ Nuevo</button>
      </div>

      ${activos.map(renderProductoRow).join('')}

      ${inactivos.length > 0 ? `
        <div class="section-title">Inactivos</div>
        ${inactivos.map(renderProductoRow).join('')}
      ` : ''}
    </div>
  `;
}

function renderProductoRow(p) {
  const ganMVD = p.precio_venta - p.costo_producto - ZONAS.MVD.costo_cadeteria;
  const ganCAN = p.precio_venta - p.costo_producto - ZONAS.CANELONES.costo_cadeteria;
  return `
    <div class="producto-row">
      <div class="producto-info">
        <div class="flex items-center gap-8" style="flex-wrap:wrap">
          <span class="producto-nombre">${escHtml(p.nombre)}</span>
          <span class="tipo-badge tipo-${p.tipo}">${p.tipo}</span>
          ${p.envio_gratis ? '<span class="badge-envio-gratis">ENVÍO GRATIS</span>' : ''}
        </div>
        <div class="producto-precios">
          Venta: ${fmt(p.precio_venta)} &nbsp;·&nbsp;
          Costo prod: ${fmt(p.costo_producto)} &nbsp;·&nbsp;
          ${p.envio_gratis
            ? `Cadetería: <span class="text-danger">${fmt(ZONAS.MVD.costo_cadeteria)}</span> (cliente no paga)`
            : `Cadetería MVD: ${fmt(ZONAS.MVD.costo_cadeteria)} / CAN: ${fmt(ZONAS.CANELONES.costo_cadeteria)}`
          }
        </div>
        <div class="producto-precios" style="margin-top:2px">
          ${p.envio_gratis
            ? `Gan MVD: <strong class="${ganMVD>=0?'text-success':'text-danger'}">${fmt(ganMVD)}</strong> &nbsp;·&nbsp;
               Gan CAN: <strong class="${ganCAN>=0?'text-success':'text-danger'}">${fmt(ganCAN)}</strong>
               &nbsp;·&nbsp; <span class="text-muted" style="font-size:.75rem">Cancelado MVD: ${fmt(ZONAS.MVD.costo_cancelado)} / CAN: ${fmt(ZONAS.CANELONES.costo_cancelado)}</span>`
            : `Gan MVD: <strong class="${ganMVD>=0?'text-success':'text-danger'}">${fmt(ganMVD)}</strong> &nbsp;·&nbsp;
               Gan CAN: <strong class="${ganCAN>=0?'text-success':'text-danger'}">${fmt(ganCAN)}</strong>`
          }
        </div>
      </div>
      <div class="flex gap-8 items-center">
        <button class="btn btn-ghost btn-sm" onclick="openFormProducto('${p.id}')">✏️</button>
        <label class="toggle">
          <input type="checkbox" ${p.activo ? 'checked' : ''}
            onchange="toggleProducto('${p.id}', this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
  `;
}

function openFormProducto(id) {
  const p = id ? State.productos.find(x => x.id === id) : null;
  const title = p ? 'Editar producto' : 'Nuevo producto';

  UI.openModal(`
    <div class="sheet-title">${title}</div>
    <div class="form-group">
      <label class="form-label">Nombre <span class="req">*</span></label>
      <input type="text" class="form-control" id="fp_nombre" value="${escHtml(p?.nombre || '')}" placeholder="Ej: Combo Pro">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Precio venta (combo)</label>
        <input type="number" class="form-control" id="fp_precio" value="${p?.precio_venta ?? ''}" inputmode="numeric">
      </div>
      <div class="form-group">
        <label class="form-label">Costo producto</label>
        <input type="number" class="form-control" id="fp_costo" value="${p?.costo_producto ?? ''}" inputmode="numeric">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Tipo</label>
        <select class="form-control" id="fp_tipo">
          <option value="simple" ${p?.tipo === 'simple' ? 'selected' : ''}>Simple</option>
          <option value="combo"  ${p?.tipo === 'combo'  ? 'selected' : ''}>Combo</option>
        </select>
      </div>
    </div>

    <!-- Envío gratis toggle -->
    <div class="card" style="padding:12px;margin-bottom:12px;border-left:3px solid #f97316">
      <div class="flex justify-between items-center">
        <div>
          <div class="fw-700" style="font-size:.9rem">Envío gratis para el cliente</div>
          <div class="text-sm text-muted">El cliente no paga envío. Cadetería sigue cobrando.</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="fp_envio_gratis" ${p?.envio_gratis ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <!-- Info de costos de envío (solo referencia) -->
    <div class="card" style="padding:10px;background:var(--gray-50);margin-bottom:12px">
      <div class="text-sm fw-700 text-muted mb-4">Referencia costos cadetería</div>
      <div class="envio-costos-row">
        <div class="envio-costo-item">
          <div class="envio-costo-label">MVD — cobra cliente</div>
          <div class="envio-costo-value">$199</div>
        </div>
        <div class="envio-costo-item">
          <div class="envio-costo-label">MVD — paga cadetería</div>
          <div class="envio-costo-value text-danger">$244</div>
        </div>
        <div class="envio-costo-item">
          <div class="envio-costo-label">CAN — cobra cliente</div>
          <div class="envio-costo-value">$285</div>
        </div>
        <div class="envio-costo-item">
          <div class="envio-costo-label">CAN — paga cadetería</div>
          <div class="envio-costo-value text-danger">$317</div>
        </div>
        <div class="envio-costo-item">
          <div class="envio-costo-label">Si cancela MVD</div>
          <div class="envio-costo-value text-danger">$189.10</div>
        </div>
        <div class="envio-costo-item">
          <div class="envio-costo-label">Si cancela CAN</div>
          <div class="envio-costo-value text-danger">$231.80</div>
        </div>
      </div>
    </div>

    <button class="btn btn-primary btn-block" onclick="guardarProducto('${id || ''}')">
      ${p ? 'Guardar cambios' : 'Crear producto'}
    </button>
  `);
}

async function guardarProducto(id) {
  const nombre = document.getElementById('fp_nombre').value.trim();
  if (!nombre) { toast('Ingresá el nombre', 'error'); return; }

  const payload = {
    nombre,
    precio_venta:        parseFloat(document.getElementById('fp_precio').value) || 0,
    costo_producto:      parseFloat(document.getElementById('fp_costo').value)  || 0,
    costo_envio_default: ZONAS.MVD.costo_cadeteria,
    tipo:                document.getElementById('fp_tipo').value,
    envio_gratis:        document.getElementById('fp_envio_gratis').checked,
  };

  try {
    if (id) {
      const updated = await DB.updateProducto(id, payload);
      const idx = State.productos.findIndex(p => p.id === id);
      if (idx >= 0) State.productos[idx] = updated;
      toast('Producto actualizado ✓');
    } else {
      const nuevo = await DB.createProducto(payload);
      State.productos.push(nuevo);
      State.productos.sort((a, b) => a.nombre.localeCompare(b.nombre));
      toast('Producto creado ✓');
    }
    UI.forceClose();
    renderView();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function toggleProducto(id, activo) {
  try {
    const updated = await DB.updateProducto(id, { activo });
    const idx = State.productos.findIndex(p => p.id === id);
    if (idx >= 0) State.productos[idx].activo = activo;
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

// ─────────────────────────────────────────────────────────────
// FILTROS
// ─────────────────────────────────────────────────────────────
function setFiltroEstado(estado) {
  State.filtroEstado = estado;
  renderView();
}

function setFiltroFecha(campo, val) {
  if (campo === 'desde') State.filtroDesde = val;
  else                   State.filtroHasta = val;
  renderView();
}

function limpiarFechas() {
  State.filtroDesde = '';
  State.filtroHasta = '';
  renderView();
}

// ─────────────────────────────────────────────────────────────
// ROUTER / NAVEGACIÓN
// ─────────────────────────────────────────────────────────────
const VIEW_TITLES = {
  dashboard:  'MultiVenta UY',
  nuevo:      'Nuevo Pedido',
  pedidos:    'Pedidos',
  liquidacion:'Liquidación',
  productos:  'Productos',
};

function navigate(view) {
  State.view = view;
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  document.getElementById('headerTitle').textContent = VIEW_TITLES[view] || 'MultiVenta UY';
  renderView();
}

function renderView() {
  switch (State.view) {
    case 'dashboard':  renderDashboard();  break;
    case 'nuevo':      renderNuevo();      break;
    case 'pedidos':    renderPedidos();    break;
    case 'liquidacion':renderLiquidacion();break;
    case 'productos':  renderProductos();  break;
  }
}

// ─────────────────────────────────────────────────────────────
// REALTIME SUPABASE
// ─────────────────────────────────────────────────────────────
function initRealtime() {
  db.channel('public:pedidos')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, payload => {
      const { eventType, new: newRow, old: oldRow } = payload;
      if (eventType === 'INSERT') {
        if (!State.pedidos.find(p => p.id === newRow.id))
          State.pedidos.unshift(newRow);
      } else if (eventType === 'UPDATE') {
        const idx = State.pedidos.findIndex(p => p.id === newRow.id);
        if (idx >= 0) State.pedidos[idx] = newRow;
        else State.pedidos.unshift(newRow);
      } else if (eventType === 'DELETE') {
        State.pedidos = State.pedidos.filter(p => p.id !== oldRow.id);
      }
      // Solo re-render si no hay modal abierto
      if (!document.getElementById('modalOverlay').classList.contains('visible'))
        renderView();
    })
    .subscribe(status => {
      const dot = document.getElementById('realtimeDot');
      if (status === 'SUBSCRIBED') {
        dot.classList.remove('offline');
        dot.title = 'Tiempo real activo';
      } else {
        dot.classList.add('offline');
        dot.title = 'Sin conexión realtime';
      }
    });
}

// ─────────────────────────────────────────────────────────────
// UTILIDADES HTML
// ─────────────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ─────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────
async function init() {
  // Validar config
  if (SUPABASE_URL.includes('TU_PROJECT_ID') || SUPABASE_KEY.includes('TU_ANON_KEY')) {
    document.getElementById('app-content').innerHTML = `
      <div class="view flex-center" style="min-height:70vh">
        <div class="card text-center" style="max-width:320px">
          <div style="font-size:2rem;margin-bottom:12px">⚙️</div>
          <div class="fw-700" style="margin-bottom:8px">Configuración requerida</div>
          <p class="text-sm text-muted">
            Editá <strong>js/config.js</strong> con tus credenciales de Supabase.<br><br>
            Consultá el <strong>README.md</strong> para instrucciones paso a paso.
          </p>
        </div>
      </div>
    `;
    return;
  }

  try {
    await Promise.all([DB.loadProductos(), DB.loadPedidos()]);
    initRealtime();
    renderView();
  } catch (e) {
    document.getElementById('app-content').innerHTML = `
      <div class="view flex-center" style="min-height:70vh">
        <div class="card text-center">
          <div style="font-size:2rem;margin-bottom:8px">❌</div>
          <div class="fw-700 text-danger">Error de conexión</div>
          <p class="text-sm text-muted mt-8">${escHtml(e.message)}</p>
          <button class="btn btn-primary mt-12" onclick="init()">Reintentar</button>
        </div>
      </div>
    `;
  }
}

// Navegación por bottom nav
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => navigate(btn.dataset.view));
});

// Arrancar
init();
