// Cloudflare Pages Function: /api/plan
// Esegue la pianificazione intelligente del viaggio con OpenAI GPT-4o-mini

export async function onRequestPost(context) {
  const { request, env } = context;

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

    const systemPrompt = `Sei un ingegnere esperto di navigazione stradale e logistica per percorsi in auto in Italia ed Europa.
L'utente ti indicherà:
- Partenza (con coordinate approssimative)
- Destinazione (con coordinate approssimative)
- Preferenze e vincoli tassativi del guidatore (es. "evita autostrade", "solo statali", "solo autostrada comoda", "evita pedaggi", "percorso panoramico lungo la costa").

REGOLE CRUCIALI PER RISPETTARE LE RICHIESTE DEL GUIDATORE:
1. SE L'UTENTE CHIEDE "EVITA AUTOSTRADE" O "NO PEDAGGI":
   - È UN VINCOLO FERREO: il motore di navigazione OSRM di default sceglie SEMPRE l'autostrada perché ha limiti di velocità più alti.
   - Per forzare il navigatore a EVITARE L'AUTOSTRADA, devi identificare da 2 a 4 punti di passaggio intermedi (waypoints) posizionati ESCLUSIVAMENTE lungo le Strade Statali principali (es. SS16 Adriatica, SS106 Jonica, SS18 Tirrenica, SS1 Aurelia, SS9 Emilia, SS7, ecc.).
   - I punti devono essere scelti in centri abitati o incroci lungo la statale (distanti dai caselli autostradali) in modo che il tragitto complessivo tra un punto e l'altro non permetta a OSRM di rientrare in autostrada.
   - Spiega chiaramente che hai impostato il transito sulle strade statali indicate per escludere i pedaggi e i tratti autostradali.

2. SE L'UTENTE CHIEDE "SOLO AUTOSTRADA COMODA":
   - Forza il transito sui nodi e raccordi autostradali principali (es. A1, A14, A2, ecc.), evitando passi montani o statali secondarie.

3. SE L'UTENTE NON DA VINCOLI O CHIEDE IL PERCORSO STANDARD:
   - Se la rotta standard rispetta già la richiesta, puoi lasciare l'array via_points vuoto [].

DEVI RISPONDERE TASSATIVAMENTE ED ESCLUSIVAMENTE CON UN OGGETTO JSON con questa struttura:
{
  "spiegazione": "Descrizione chiara del percorso impostato, specificando le strade statali o le autostrade scelte per soddisfare la richiesta",
  "via_points": [
    {
      "nome": "Nome della località o strada statale intermedia",
      "lat": 40.1234,
      "lon": 16.5678
    }
  ]
}`;

    const userPrompt = `Dati di viaggio:
- Partenza: ${JSON.stringify(origin)}
- Destinazione: ${JSON.stringify(destination)}
- RICHIESTA/PREFERENZA GUIDATORE: "${preferences || 'Percorso standard'}"

Calcola i via_points necessari per garantire il rispetto assoluto della preferenza (in particolare se chiede di evitare autostrade).`;

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
        temperature: 0.2
      })
    });

    if (!openAiResponse.ok) {
      const errData = await openAiResponse.json().catch(() => ({}));
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
        "Cache-Control": "public, max-age=1800"
      }
    });

  } catch (error) {
    return new Response(
      JSON.stringify({ error: `Errore interno server: ${error.message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
