// ============================================================
// config.js — Credenciales Supabase
// ============================================================
// 1. Ir a https://supabase.com/dashboard > tu proyecto
// 2. Settings > API
// 3. Copiar "Project URL" y "anon public key"
// ============================================================

const SUPABASE_URL  = 'https://rurxvfpgvvbfksobpuua.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1cnh2ZnBndnZiZmtzb2JwdXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNzM2NjksImV4cCI6MjA5MTc0OTY2OX0.dOzXzaNW_AG37iwGwA9Z6ZXIdfn1wCLpP6ScxUwPFdc';

// Configuración del negocio
const NEGOCIO = {
  nombre:          'MultiVenta UY',
  mi_porcentaje:   0.66,   // 66% de la ganancia
  soc_porcentaje:  0.34,   // 34% de la ganancia
  costo_split:     0.50,   // costos 50/50
};
