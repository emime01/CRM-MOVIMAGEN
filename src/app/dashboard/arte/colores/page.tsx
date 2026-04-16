export const dynamic = 'force-dynamic'

const COLORES = [
  { codigo: 'Pantone 485 C',  nombre: 'Rojo',     hex: '#DA291C' },
  { codigo: 'Pantone 072 C',  nombre: 'Azul',     hex: '#003087' },
  { codigo: 'Pantone 130 C',  nombre: 'Amarillo', hex: '#FFA300' },
  { codigo: 'Pantone 347 C',  nombre: 'Verde',    hex: '#009A44' },
  { codigo: 'Pantone 265 C',  nombre: 'Violeta',  hex: '#7B2D8B' },
  { codigo: 'Pantone 021 C',  nombre: 'Naranja',  hex: '#FE5000' },
  { codigo: 'Pantone 7461 C', nombre: 'Celeste',  hex: '#0076A8' },
  { codigo: 'Pantone 7526 C', nombre: 'Borgoña',  hex: '#6B2D4D' },
  { codigo: 'Pantone 877 C',  nombre: 'Plateado', hex: '#8A8D8F' },
  { codigo: 'Pantone 871 C',  nombre: 'Dorado',   hex: '#84754E' },
  { codigo: 'Process Black',  nombre: 'Negro',    hex: '#000000' },
  { codigo: 'Process White',  nombre: 'Blanco',   hex: '#FFFFFF', border: true },
]

const SPECS = [
  ['Formato entrega', 'PDF/X-1a o AI con fuentes vectorizadas'],
  ['Modo de color', 'CMYK — Perfil ISO Coated v2'],
  ['Resolución mínima', '300 dpi a tamaño real'],
  ['Sangría', '5 mm en todos los bordes'],
  ['Tipografías', 'Convertidas a curvas o embebidas'],
  ['Pantallas LED', 'Archivos adicionales en RGB 72 dpi para digital'],
]

export default function ColoresPage() {
  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24 }}>
        Paleta de referencia para producción gráfica. Todos los archivos deben entregarse en modo CMYK con perfil ISO Coated v2.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 16, marginBottom: 32 }}>
        {COLORES.map(c => (
          <div key={c.codigo} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ height: 90, background: c.hex, border: (c as any).border ? '1px solid var(--border)' : 'none' }} />
            <div style={{ padding: '10px 12px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{c.nombre}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{c.codigo}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: 1 }}>{c.hex}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>Especificaciones técnicas para entrega</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {SPECS.map(([k, v]) => (
            <div key={k} style={{ paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>{k}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
