// Cloudflare Pages Function: /api/plan
// Esegue la pianificazione intelligente del viaggio con OpenAI GPT-4o-mini con motore di autocritica e ottimizzazione continua

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
        error: "OPENAI_API_KEY non trovata nelle variabili d'ambiente di Cloudflare Pages. Puoi anche inserirla dall'icona chiave 🔑 nell'app."
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

    const systemPrompt = `Sei un ingegnere e copilota esperto di navigazione, cartografia e logistica stradale automobilistica per percorsi in Italia ed Europa a supporto del motore cartografico OSRM.
Il tuo compito è analizzare la mappa, il percorso e la richiesta del guidatore, scandagliando le arterie viarie e facendoti costantemente questa domanda di autocritica: "Ho fatto bene a farlo andare di qua? Potevo fare di meglio? C'è un percorso migliore, con strade più scorrevoli, asfalto migliore, tempi brevi e km minori?". Se puoi fare di meglio, AGGIUSTA la rotta.

METODO DI RAGIONAMENTO E AUTOCRITICA:

1. COMPRENSIONE INTELLIGENTE DELLE STRADE E DELLA RICHIESTA:
   - I punti possono essere posizionati a qualsiasi distanza (anche vicino alla partenza o all'arrivo se serve evitare il centro o prendere subito una tangenziale/arteria di scorrimento), MA DEVONO TROVARSI TASSATIVAMENTE SU STRADE PRINCIPALI DI SCORRIMENTO (SS Statali, SP Provinciali primarie, raccordi autostradali).
   - MAI posizionare coordinate su stradine poderali, vie di campagna a fondo cieco, o cortili che costringano l'auto a deviare dalla provinciale per poi tornare indietro!
   - Se l'utente chiede "PREDILIGI AUTOSTRADA", individua il corridoio a scorrimento veloce/autostradale naturale (es. SS106 a 4 corsie fino a Taranto Nord per entrare in A14 Adriatica diretta, evitando passi montani appenninici isolati).
   - Se l'utente chiede "EVITA AUTOSTRADE" / "NO PEDAGGI", mantieni le Strade Statali (SS) e Provinciali (SP) di scorrimento veloci e dirette che evitano i caselli a pedaggio senza fare allunghi assurdi.

2. SCANDAGLIO E AUTOCRITICA ("Ho fatto bene a farlo andare di qua? Potevo fare di meglio?"):
   - Prima di confermare i waypoints, rifletti:
     * "Questo punto fa fare una deviazione inutile fuori rotta o entra in una stradina cieca?"
     * "La strada scelta è scorrevole o tortuosa?"
     * "Rispetta la richiesta dell'utente con il minor tempo e chilometri possibili?"
   - Se rilevi un allungo inutile o una strada secondaria non idonea, correggi e sposta il waypoint sull'arteria principale più logica, scorrevole e diretta.

3. RISPONDI TASSATIVAMENTE IN FORMATO JSON:
{
  "autocritica": "Sintesi dell'analisi critica del percorso: cosa è stato verificato, quali allunghi sono stati evitati e perché la soluzione proposta è la migliore.",
  "spiegazione": "Descrizione chiara per il guidatore della rotta ottimizzata e delle arterie scelte.",
  "proposte": [
    {
      "nome": "Titolo della strategia (es. Corridoio A14 Adriatica veloce, o Statale SS106 senza pedaggi)",
      "descrizione": "Dettaglio delle strade seguite",
      "via_points": [
        {
          "nome": "Nome casello, snodo o arteria principale",
          "lat": 40.5432,
          "lon": 17.1234
        }
      ]
    }
  ]
}`;

    let baselineDesc = "";
    if (baseline_route && baseline_route.roads && baseline_route.roads.length > 0) {
      baselineDesc = `\n- Percorso precalcolato iniziale dal navigatore:
  * Distanza: ${baseline_route.distance_km || '--'} km
  * Durata: ${baseline_route.duration_min || '--'} min
  * Strade attualmente usate: ${baseline_route.roads.join(', ')}`;
    }

    const userPrompt = `DATI DI VIAGGIO:
- Partenza: ${JSON.stringify(origin)}
- Destinazione: ${JSON.stringify(destination)}${baselineDesc}
- RICHIESTA GUIDATORE: "${preferences || 'Percorso migliore bilanciato'}"

Scandaglia il percorso, effettua l'autocritica e genera le proposte di waypoints ottimali su strade primarie, assicurando il miglior compromesso tra tempi, chilometri e scorrevolezza.`;

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
