export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, msg: 'Método no permitido' });

    try {
        const { local, fotoBase64 } = req.body;
        if (!local || !fotoBase64) return res.status(400).json({ success: false, msg: 'Faltan datos.' });

        // Solo necesitamos la llave de OpenAI, la de Supabase no hace falta porque actualiza el frontend
        const openAiKey = process.env.OPENAI_API_KEY;

        if (!openAiKey) return res.status(500).json({ success: false, msg: 'Falta la llave de OpenAI en Vercel.' });

        const fechaHoy = new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

        // ORDEN ESTRICTA DE DOS NIVELES (ESTÁNDAR O VIP)
        const systemPrompt = `Sos un auditor financiero extremadamente estricto. Analizá este comprobante de transferencia bancaria. 
        Tene en cuenta que la fecha de hoy es: ${fechaHoy}.
        
        Debe cumplir TODAS estas condiciones sin excepción:
        1. MONTO EXACTO: El monto debe ser exactamente $14.000 (Catorce mil pesos) O exactamente $29.000 (Veintinueve mil pesos).
        2. EL DESTINATARIO: Debe ser obligatoriamente: "Luis Angel Acosta" (o variaciones), O el Alias: "noir.elite.ceo", O el CBU: "0110257630025717844115".
        3. ESTADO: Debe ser una transferencia real (Ej: dice "Comprobante de transferencia", "Aprobada", "Exitosa", o tiene un "Id Op."). Rechazá si dice "Programada" o "Pendiente".
        4. ANTIFRAUDE: La fecha del comprobante debe ser de hoy o máximo 48 hs atrás. Si es vieja, rechazá diciendo: "El ticket es viejo o ya fue utilizado."
        
        Devolveme UNICAMENTE un objeto JSON estricto con este formato: 
        {"aprobado": true, "plan": "VIP", "motivo": "Explicación corta"} (Si pagó 29000)
        {"aprobado": true, "plan": "ESTANDAR", "motivo": "Explicación corta"} (Si pagó 14000)
        
        Si el monto es incorrecto (ej: transfirió menos plata) o es sospechoso, respondé:
        {"aprobado": false, "plan": "NINGUNO", "motivo": "Por qué se rechazó"}`;

        const openAiPayload = {
            model: "gpt-4o",
            messages: [{ role: "user", content: [{ type: "text", text: systemPrompt }, { type: "image_url", image_url: { url: fotoBase64 } }] }],
            response_format: { type: "json_object" },
            max_tokens: 200
        };

        const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(openAiPayload)
        });

        const openAiData = await openAiRes.json();
        const iaDecision = JSON.parse(openAiData.choices[0].message.content);

        // Si la IA detecta que el comprobante no sirve (o mandó $1.000 pesos de vivo), frena todo
        if (!iaDecision.aprobado) return res.status(200).json({ success: false, msg: "Ticket Rechazado: " + iaDecision.motivo });

        // SI LLEGAMOS ACÁ, EL TICKET ES VÁLIDO Y LA IA DETECTÓ QUÉ PLAN ELIGIÓ EL DUEÑO
        return res.status(200).json({ 
            success: true, 
            plan: iaDecision.plan, // Devuelve "VIP" o "ESTANDAR"
            msg: `¡Pago Aprobado! Plan ${iaDecision.plan} activado por 30 días.` 
        });

    } catch (error) { 
        return res.status(500).json({ success: false, msg: error.message }); 
    }
}
