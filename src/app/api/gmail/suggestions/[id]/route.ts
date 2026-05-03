import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

// PATCH /api/gmail/suggestions/[id] → { status: 'applied' | 'dismissed' }
// Si status === 'applied' y es new_lead, crea el lead automáticamente.
// Si es update_lead con lead_id existente, agrega nota al lead.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = (session.user as { id: string }).id
  const { status } = await req.json()

  if (!['applied', 'dismissed'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const supabase = createServerClient()

  let createdLeadId: string | null = null
  let updatedLeadId: string | null = null

  if (status === 'applied') {
    const { data: suggestion } = await supabase
      .from('email_suggestions')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', userId)
      .single()

    if (suggestion) {
      const data = (suggestion.suggestion_data ?? {}) as {
        summary?: string
        suggested_action?: string
        extracted_amounts?: number[]
      }

      if (suggestion.suggestion_type === 'new_lead') {
        // Try to match cliente by sender email
        const { data: matchedCliente } = await supabase
          .from('clientes')
          .select('id')
          .ilike('email', suggestion.from_email ?? '')
          .maybeSingle()

        const monto = Array.isArray(data.extracted_amounts) && data.extracted_amounts.length > 0
          ? Number(data.extracted_amounts[0])
          : null

        const descripcion = data.summary || `Lead desde email: ${suggestion.subject ?? ''}`
        const notas = [
          `Recibido por email de ${suggestion.from_name || suggestion.from_email || 'remitente desconocido'}`,
          suggestion.subject ? `Asunto: ${suggestion.subject}` : '',
          data.suggested_action ? `\n${data.suggested_action}` : '',
          suggestion.body_preview ? `\n---\n${suggestion.body_preview}` : '',
        ].filter(Boolean).join('\n')

        const { data: newLead } = await supabase
          .from('leads')
          .insert({
            vendedor_id: userId,
            cliente_id: matchedCliente?.id ?? null,
            descripcion,
            monto_potencial: monto,
            notas,
            estado: 'nuevo',
          })
          .select('id')
          .single()

        createdLeadId = newLead?.id ?? null
      } else if (suggestion.suggestion_type === 'update_lead' && suggestion.lead_id) {
        const newNote = `[${new Date().toLocaleDateString('es-AR')}] Email de ${suggestion.from_name || suggestion.from_email}: ${data.summary || data.suggested_action || suggestion.subject || ''}`

        const { data: existingLead } = await supabase
          .from('leads')
          .select('notas')
          .eq('id', suggestion.lead_id)
          .single()

        await supabase
          .from('leads')
          .update({ notas: ((existingLead?.notas ?? '') + '\n\n' + newNote).trim() })
          .eq('id', suggestion.lead_id)

        updatedLeadId = suggestion.lead_id
      }
    }
  }

  const { data, error } = await supabase
    .from('email_suggestions')
    .update({ status })
    .eq('id', params.id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, createdLeadId, updatedLeadId })
}
