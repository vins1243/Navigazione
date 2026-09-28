// Cloudflare Pages Function: /api/plan
// Esegue la pianificazione intelligente del viaggio con OpenAI GPT-4o-mini analizzando e modificando il percorso precalcolato

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
    const { origin, destination, preferences, baseline_route } = body;

    if (!origin || !destination) {
      return new Response(
        JSON.stringify({ error: "Origine e destinazione sono obbligatorie." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `Sei un ingegnere esperto di navigazione stradale e logistica automobilistica per percorsi in auto in Italia ed Europa.
Il tuo compito principale è ANALIZZARE IL PERCORSO PRECALCOLATO dal navigatore e MODIFICARLO inserendo punti di passaggio strategici (waypoints) per soddisfare fedelmente le richieste del guidatore.

COME ELABORARE E MODIFICARE IL PERCORSO PRECALCOLATO:
1. Riceverai la lista delle strade/autostrade attualmente usate dal percorso precalcolato, con la distanza e la durata stimata.
2. SE L'UTENTE CHIEDE "EVITA AUTOSTRADE" O "NO PEDAGGI":
   - Esamina le autostrade presenti nel percorso precalcolato (es. A1, A14, A2, A4, A24, tangenziali a pedaggio, ecc.).
   - Individua le Strade Statali o Regionali alternative (es. SS16 Adriatica, SS106 Jonica, SS18 Tirrenica, SS1 Aurelia, SS9 Via Emilia, SS3bis Tiberina, SS7, ecc.).
   - Scegli da 2 a 4 waypoints precisi (cittadine, centri o incroci strategici lungo la statale ben distanti dai caselli autostradali) in modo che il motore OSRM sia forzato a viaggiare sulla statale senza rientrare in autostrada.
3. SE L'UTENTE CHIEDE "EVITA CENTRI URBANI" O "ZERO ZTL":
   - Identifica se il percorso precalcolato attraversa centri storici o vie urbane interne.
   - Posiziona waypoints su tangenziali esterne, circonvallazioni o arterie a scorrimento periferiche per bypassare i centri abitati.
4. SE L'UTENTE CHIEDE "PANORAMICO" / "COSTIERO":
   - Modifica il percorso precalcolato deviando su strade costiere (litoranee), lacustri o valichi paesaggistici.
5. SE L'UTENTE CHIEDE "SOLO AUTOSTRADA COMODA":
   - Se il percorso precalcolato include strade tortuose o passi secondari, forza il transito sui raccordi e snodi autostradali principali.
6. SE LA RICHIESTA È GIÀ SODDISFATTA DAL PERCORSO PRECALCOLATO O NON RICHIEDE MODIFICHE:
   - Restituisci l'array "via_points" vuoto [].

DEVI RISPONDERE TASSATIVAMENTE ED ESCLUSIVAMENTE CON UN OGGETTO JSON con questa struttura esatta:
{
  "spiegazione": "Descrizione chiara delle modifiche apportate rispetto al percorso precalcolato, specificando le autostrade o zone evitate e le statali/arterie alternative inserite.",
  "via_points": [
    {
      "nome": "Località o arteria alternativa intermedia",
      "lat": 40.1234,
      "lon": 16.5678
    }
  ]
}`;

    const baselineInfo = baseline_route ? `
PERCORSO STANDARD ATTUALMENTE PRECALCOLATO DAL NAVIGATORE:
- Distanza attuale: ${baseline_route.distance_km || '--'} km
- Durata prevista: ${baseline_route.duration_min || '--'} min
- Strade e arterie utilizzate: ${(baseline_route.roads || []).join(', ') || 'Strade standard'}
` : '';

    const userPrompt = `Dati di viaggio:
- Partenza: ${JSON.stringify(origin)}
- Destinazione: ${JSON.stringify(destination)}
${baselineInfo}
- RICHIESTA/MODIFICHE DEL GUIDATORE: "${preferences || 'Nessuna preferenza'}"

Analizza il percorso precalcolato e le strade utilizzate. Modificalo per soddisfare la richiesta del guidatore determinando i via_points necessari.`;

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
