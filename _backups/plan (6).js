// Cloudflare Pages Function: /api/plan
// Esegue l'ottimizzazione intelligente del viaggio con OpenAI GPT-4o-mini generando scenari ottimali

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

    const systemPrompt = `Sei un ingegnere e copilota esperto di navigazione e logistica stradale automobilistica per percorsi in Italia ed Europa a supporto del motore cartografico OSRM.
Il tuo obiettivo è individuare il PERCORSO OTTIMALE: il perfetto connubio tra la richiesta del guidatore, la migliore qualità delle strade (asfalto, carreggiate ampie e sicure), tempi di percorrenza brevi e chilometri contenuti, EVITANDO ASSOLUTAMENTE allunghi o deviazioni montane assurde.

REGOLE CRUCIALI PER LE STRATEGIE:

1. COMPRENSIONE INTELLIGENTE DEI CORRIDOI:
   - SE L'UTENTE CHIEDE "PREDILIGI AUTOSTRADA" / "SOLO AUTOSTRADA":
     * Individua il corridoio a scorrimento veloce/autostradale principale NATURALE.
     * Esempio (Calabria/Ionio -> Puglia/Gargano): NON attraversare le montagne della Basilicata/Appennino per prendere l'A2 a ovest! Il corridoio logico e naturale è salire sulla SS106 Jonica (superstrada a 4 corsie) fino allo snodo autostradale di Taranto Nord, imboccando l'Autostrada A14 Adriatica diretta verso Bari, Barletta, Cerignola e Foggia.
     * I waypoint devono convogliare il veicolo sull'arteria autostradale principale più scorrevole, evitando passi montani tortuosi o statali secondarie.

   - SE L'UTENTE CHIEDE "EVITA AUTOSTRADE" / "NO PEDAGGI":
     * L'obiettivo è NON PAGARE IL PEDAGGIO delle autostrade (tratte con lettera 'A', es. A14, A16, A1), mantenendo la viabilità ordinaria più DIRETTA, FLUIDA ed EFFICIENTE possibile.
     * NON evitare le Strade Provinciali (SP) o Statali (SS) scorrevoli e veloci: sono la via corretta per non pagare il pedaggio.
     * Inserisci 2-3 punti lungo la direttrice statale principale (es. SS106, SS96, SS16, SS658) che bypassano i caselli senza allungare inutilmente.

2. PROGRESSIONE LINEARE IN AVANTI (DIVIETO ASSOLUTO DI RETROMARCIA O ANELLI):
   - I punti devono avanzare SEMPRE e solo in avanti verso la destinazione lungo la direttrice naturale.
   - Vietati anelli, tornanti a ritroso, o deviazioni di decine di km fuori asse.

3. TENTATIVI E VARIANTI MULTIPLE (Per permettere al navigatore di calcolare e scegliere la migliore):
   - Devi fornire un array "proposte" con 1 o 2 strategie candidate differenti (es. opzione autostradale primaria, opzione bilanciata, opzione alternativa).
   - Per ciascuna strategia fornisci da 1 a 3 waypoints mirati con coordinate precise.

RISPONDI TASSATIVAMENTE ED ESCLUSIVAMENTE CON UN OGGETTO JSON con questa struttura esatta:
{
  "spiegazione": "Sintesi chiara della strategia migliore individuata e del perché rappresenta il miglior connubio tra strade, tempi e km",
  "proposte": [
    {
      "nome": "Titolo breve della strategia (es. Autostrada A14 Adriatica veloce, o Statale SS106 senza pedaggi)",
      "descrizione": "Spiegazione sintetica della rotta e delle arterie scelte",
      "via_points": [
        {
          "nome": "Nome casello, snodo o località strategica",
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

Genera le proposte di waypoints ottimali tenendo conto di tempi brevi, chilometri contenuti e qualità delle strade.`;

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
