export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    if (url.pathname === '/api/plan') {
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Metodo non consentito' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const apiKey = env.OPENAI_API_KEY;
      if (!apiKey) {
        return new Response(
          JSON.stringify({
            error: "OPENAI_API_KEY non configurata nelle variabili d'ambiente di Cloudflare."
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

        const systemPrompt = `Sei un ingegnere esperto di navigazione stradale e logistica per percorsi in auto in Italia ed Europa.
Lavori a supporto del motore cartografico OSRM, che di default sceglie SEMPRE le autostrade per via dei limiti di velocità più alti.

Il tuo compito è analizzare la richiesta del guidatore ed eventualmente il percorso precalcolato, e restituire dei punti di passaggio geografici intermedi (waypoints) che DEVONO FORZARE FISICAMENTE il navigatore a cambiare strada.

REGOLE TASSATIVE PER GENERARE I WAYPOINTS:

1. SE L'UTENTE CHIEDE "EVITA AUTOSTRADE" / "NO PEDAGGI" / "SOLO STATALI":
   - OSRM cerca in tutti i modi di rientrare in autostrada tra un punto e l'altro se trova un casello vicino.
   - Per impedire questo in modo ferreo, DEVI generare da 3 a 5 waypoints intermedi ben distribuiti lungo l'intero tragitto.
   - Ogni punto DEVE trovarsi su una Strada Statale o Regionale principale (es. SS16 Adriatica, SS106 Jonica, SS18 Tirrenica, SS1 Aurelia, SS9 Via Emilia, SS67, SS3bis Tiberina, ecc.).
   - SCEGLI CENTRI ABITATI O SNODI LUNGO LA STATALE CHE SIANO BEN DISTANTI DAI CASELLI AUTOSTRADALI, così che percorrere l'autostrada tra un punto e l'altro sia per OSRM uno svantaggio chilometrico evidente e sia costretto a restare sulla statale.

2. SE L'UTENTE CHIEDE "SOLO AUTOSTRADA" / "PREDILIGI AUTOSTRADA" / "COMFORT":
   - Se il percorso prevede tratti secondari o passi tortuosi, inserisci da 1 a 3 waypoints sui nodi e raccordi autostradali principali per garantire viabilità a corsie separate.

3. SE L'UTENTE CHIEDE "PANORAMICO" / "LUNGO IL MARE":
   - Inserisci da 2 a 4 waypoints su litoranee, lungomari o strade costiere panoramiche.

4. SE L'UTENTE CHIEDE "EVITA CENTRI URBANI" / "ZERO ZTL":
   - Inserisci waypoints su tangenziali esterne o circonvallazioni periferiche per evitare che il percorso attraversi centri abitati congestionati.

5. SE LA RICHIESTA È GIÀ SODDISFATTA DAL PERCORSO O NON RICHIEDE DEVIAZIONI:
   - Restituisci l'array via_points vuoto [].

DEVI RISPONDERE TASSATIVAMENTE ED ESCLUSIVAMENTE CON UN OGGETTO JSON con questa struttura esatta:
{
  "spiegazione": "Descrizione chiara e sintetica della rotta impostata, citando le strade statali o autostrade scelte per soddisfare la preferenza.",
  "via_points": [
    {
      "nome": "Nome della località intermedia o strada statale",
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

    if (env && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response("Not Found", { status: 404 });
  }
};
