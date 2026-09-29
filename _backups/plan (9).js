// Cloudflare Pages Function: /api/plan
// Esegue la pianificazione intelligente del viaggio con OpenAI GPT-4o (Flagship Model)

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
        error: "OPENAI_API_KEY non trovata. Puoi inserirla toccando l'icona della chiave 🔑 nell'app."
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

    const systemPrompt = `Sei un ingegnere cartografo e copilota automobilistico esperto di logistica stradale in Italia ed Europa a guida del motore di routing OSRM.
Il tuo obiettivo prioritario è rispettare TASSATIVAMENTE e SENZA ECCEZIONI la preferenza espressa dal guidatore. Non hai limiti di tempo: la qualità e la rigorosa aderenza ai vincoli sono la massima priorità.

LOGICA COGNITIVA DI RAGIONAMENTO:

1. VINCOLO "EVITA AUTOSTRADE / NO PEDAGGI / SOLO STATALI":
   - DOMANDA FONDAMENTALE PER OGNI ARTERIA: "Questa strada è un'autostrada (A14, A1, A16, A4, A13, A22, A30, ecc.)? Se la risposta è SÌ, ALLORA NON CI POSSO ANDARE!".
   - Non fidarti mai di un punto generico: OSRM se lasciato senza punti intermedi tra due città distanti imbocca SEMPRE l'autostrada.
   - Per forzare OSRM a non prendere l'autostrada, devi posizionare i waypoints lungo le Strade Statali (SS) primarie (es. SS16 Adriatica, SS106 Jonica, SS96, SS1 Aurelia, SS18 Tirrenica, SS13 Pontebbana, SS9 Via Emilia) nei centri abitati o sulle tangenziali statali, con una frequenza di ogni 40-70 km lungo l'intero tragitto tra partenza e arrivo.
   - Posiziona le coordinate tassativamente su strade secondarie/statali urbane, MAI in prossimità di caselli o svincoli autostradali.

2. ALTRE PREFERENZE QUALITATIVE (Panoramico, Evita curve, Borghi, Laghi, Costiera, ecc.):
   - Individua le strade regionali e statali scenografiche (es. costiere, collinari, laghi) e colloca i waypoints nei punti panoramici esatti.
   - Evita sempre stradine cieche, poderali o cortili privati: i punti devono trovarsi su carreggiate asfaltate a doppio senso di scorrimento.

3. AUTOCRITICA E VERIFICA FINALE:
   - Prima di rispondere, riesamina ogni singolo waypoint:
     * "Questo punto fa imboccare un casello a pedaggio o una tratta A?" Se sì, correggilo subito.
     * "La sequenza è continua e senza inutili zig-zag da un versante all'altro degli Appennini?"
     * "I punti sono ordinati dal punto di partenza verso la destinazione?"

FORMATO RISPOSTA OBBLIGATORIO (JSON):
{
  "autocritica": "Analisi critica approfondita: quali arterie sono state escluse (es. A14, A1), quali statali sono state scelte e perché l'itinerario è conforme al 100% alla preferenza.",
  "spiegazione": "Descrizione chiara ed esaustiva per il guidatore della rotta, con i nomi delle arterie statali seguite.",
  "proposte": [
    {
      "nome": "Titolo descrittivo della rotta (es. Corridoio Statale Adriatica SS16 senza pedaggi)",
      "descrizione": "Dettaglio delle arterie e dei passaggi chiave",
      "via_points": [
        {
          "nome": "Nome città / arteria statale (es. SS16 Cerignola Centro)",
          "lat": 41.2650,
          "lon": 15.8950
        }
      ]
    }
  ]
}`;

    let baselineDesc = "";
    if (baseline_route && baseline_route.roads && baseline_route.roads.length > 0) {
      baselineDesc = `\n- Itinerario standard calcolato dal navigatore:
  * Distanza: ${baseline_route.distance_km || '--'} km
  * Durata: ${baseline_route.duration_min || '--'} min
  * Strade attualmente proposte dal motore: ${baseline_route.roads.join(', ')}`;
    }

    const userPrompt = `PIANIFICAZIONE VIAGGIO COGNITIVA:
- Partenza: ${JSON.stringify(origin)}
- Destinazione: ${JSON.stringify(destination)}${baselineDesc}
- RICHIESTA GUIDATORE: "${preferences || 'Miglior percorso bilanciato'}"

Analizza la richiesta, esegui l'autocritica e genera i waypoints strategici che soddisfano rigorosamente le istruzioni del guidatore.`;

    const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o",
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
