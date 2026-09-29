export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const headerKey = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const apiKey = (env && (env.OPENAI_API_KEY || env.OPENAI_KEY || env.API_KEY || env.AI_KEY)) || headerKey;

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: "OPENAI_API_KEY non trovata nelle variabili d'ambiente di Cloudflare Pages."
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }

  try {
    const body = await request.json();
    const { origin, destination, preferences, baseline_route } = body;

    if (!origin || !destination) {
      return new Response(
        JSON.stringify({ error: "Origine e destinazione sono obbligatorie." }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }

    const systemPrompt = `Sei un ingegnere esperto di navigazione stradale e logistica automobilistica per percorsi in auto in Italia ed Europa a supporto del motore cartografico OSRM.
Il tuo compito è analizzare la richiesta del guidatore e il percorso precalcolato, inserendo i waypoints necessari per rispettare le preferenze SENZA MAI FARE ALLUNGHI O GIRI INUTILI.

PRINCIPI GUIDA FONDAMENTALI:
1. PROGRESSIONE LINEARE IN AVANTI (DIVIETO ASSOLUTO DI RETROMARCIA O ANELLI):
   - I waypoints DEVONO trovarsi sempre strettamente lungo la direttrice di marcia tra Partenza e Destinazione.
   - Non inserire MAI punti che si trovino "alle spalle" della partenza o oltre la destinazione.
   - Ordina sempre i waypoints in modo rigorosamente cronologico lungo il senso di marcia (dal più vicino alla partenza al più vicino all'arrivo).
   - Non fare MAI deviazioni a zig-zag o anelli montani assurdi.

2. SE L'UTENTE CHIEDE "EVITA AUTOSTRADE" / "NO PEDAGGI":
   - L'obiettivo è NON PAGARE IL PEDAGGIO delle autostrade (tratte 'A', es. A14, A16, A1, ecc.), mantenendo la rotta ordinaria più DIRETTA, FLUIDA ed EFFICIENTE possibile.
   - NON evitare le Strade Provinciali (SP) o Statali (SS) scorrevoli: sono la via corretta per non pagare il pedaggio.
   - Inserisci da 2 a 3 waypoints strategici posizionati sui nodi delle principali arterie ordinarie alternative (es. SS106 Jonica, SS16 Adriatica, SS7, SS96, SS658, SP principali) esattamente nei punti in cui OSRM tenderebbe a imboccare l'autostrada a pedaggio.
   - Esempio: se da Francavilla Marittima si viaggia verso nord/Puglia, il percorso senza pedaggio sale dritto sulla SS106 Jonica e poi taglia via Statali/Provinciali interne (es. Metaponto, Matera, Altamura, Cerignola, Foggia) SENZA scendere verso sud in Calabria!

3. SE L'UTENTE CHIEDE "SOLO AUTOSTRADA" / "PREDILIGI AUTOSTRADA":
   - Inserisci waypoints sui caselli o raccordi autostradali principali per forzare il viaggio a corsie separate.

4. SE L'UTENTE CHIEDE "PANORAMICO":
   - Scegli tappe lungo litoranee o laghi, ma sempre avanzando linearmente verso la destinazione.

5. SE LA RICHIESTA È GIÀ SODDISFATTA:
   - Restituisci via_points vuoto [].

DEVI RISPONDERE TASSATIVAMENTE ED ESCLUSIVAMENTE CON UN OGGETTO JSON con questa struttura esatta:
{
  "spiegazione": "Descrizione sintetica del percorso senza pedaggi impostato sulle statali/provinciali più dirette.",
  "via_points": [
    {
      "nome": "Località o snodo stradale ordinario",
      "lat": 40.1234,
      "lon": 16.5678
    }
  ]
}`;

    let baselineDesc = "";
    if (baseline_route && baseline_route.roads && baseline_route.roads.length > 0) {
      baselineDesc = `\n- Percorso attualmente precalcolato dal navigatore:\n  * Distanza: ${baseline_route.distance_km || '--'} km\n  * Durata: ${baseline_route.duration_min || '--'} min\n  * Strade attualmente usate: ${baseline_route.roads.join(', ')}`;
    }

    const userPrompt = `DATI DI VIAGGIO:
- Partenza: ${JSON.stringify(origin)}
- Destinazione: ${JSON.stringify(destination)}${baselineDesc}
- RICHIESTA GUIDATORE: "${preferences || 'Nessuna preferenza'}"

Calcola i via_points necessari per garantire che il navigatore OSRM segua fedelmente la preferenza richiesta (soprattutto se richiede di evitare o forzare autostrade).`;

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
        {
          status: openAiResponse.status,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }

    const aiData = await openAiResponse.json();
    const content = aiData.choices[0].message.content;
    const parsed = JSON.parse(content);

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=1800"
      }
    });

  } catch (error) {
    return new Response(
      JSON.stringify({ error: `Errore interno server: ${error.message}` }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
}
