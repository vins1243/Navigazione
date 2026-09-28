// Cloudflare Pages Function: /api/plan
// Esegue la pianificazione intelligente del viaggio con OpenAI GPT-4o-mini

export async function onRequestPost(context) {
  const { request, env } = context;

  // Verifica presenza della chiave nelle variabili d'ambiente di Cloudflare
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: "OPENAI_API_KEY non configurata nelle variabili d'ambiente di Cloudflare Pages."
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  try {
    const body = await request.json();
    const { origin, destination, preferences } = body;

    if (!origin || !destination) {
      return new Response(
        JSON.stringify({ error: "Origine e destinazione sono obbligatorie." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `Sei un assistente AI specializzato nella pianificazione di percorsi stradali intelligenti.
L'utente ti fornirà:
- Partenza (nome città/luogo e coordinate approssimative)
- Destinazione (nome città/luogo e coordinate approssimative)
- Preferenze e stile di guida (es. "solo autostrada comoda anche se allungo", "evita passi di montagna tortuosi", "strade panoramiche costiere", "evita pedaggi").

Il tuo compito è:
1. Analizzare il tragitto stradale tra Partenza e Destinazione.
2. Comprendere se il percorso standard soddisfa le preferenze dell'utente.
3. Se l'utente richiede preferenze specifiche che deviano dalla rotta più veloce standard, individua da 1 a 3 punti di passaggio intermedi strategici (snodi autostradali, caselli, bivi o città chiave con coordinate geografiche reali [lat, lon]) che "costringono" il motore di navigazione a seguire l'itinerario desiderato.
4. Se il percorso standard rispetta già le preferenze, puoi lasciare la lista dei via_points vuota [].

Rispondi ESCLUSIVAMENTE con un oggetto JSON valido con questa struttura esatta:
{
  "spiegazione": "Breve spiegazione in italiano per il guidatore del perché hai scelto questo percorso e quali vantaggi offre.",
  "via_points": [
    {
      "nome": "Nome dello snodo o punto di passaggio",
      "lat": 44.5020,
      "lon": 11.2750
    }
  ]
}`;

    const userPrompt = `Partenza: ${JSON.stringify(origin)}
Destinazione: ${JSON.stringify(destination)}
Preferenze del guidatore: "${preferences || 'Percorso standard'}"`;

    // Chiamata alle API di OpenAI
    const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3
      })
    });

    if (!openAiResponse.ok) {
      const errData = await openAiResponse.json();
      return new Response(
        JSON.stringify({ error: `Errore OpenAI: ${errData.error?.message || openAiResponse.statusText}` }),
        { status: openAiResponse.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const aiData = await openAiResponse.json();
    const content = aiData.choices[0].message.content;
    const parsed = JSON.parse(content);

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600"
      }
    });

  } catch (error) {
    return new Response(
      JSON.stringify({ error: `Errore interno server: ${error.message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
