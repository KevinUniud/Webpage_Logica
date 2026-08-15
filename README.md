# TestLogica Web

Frontend didattico di TestLogica, realizzato in HTML, CSS e JavaScript senza
framework runtime. Offre lezioni, quiz generati dall'API, progressi personali,
quaderno degli errori, grafici, modalita parlata e un Laboratorio di logica.

Questa directory e la radice autonoma del repository **Webpage**: build, test,
configurazione Docker e documentazione non dipendono da file collocati nella
directory padre. L'API e un repository separato e viene raggiunta via HTTP.

## Funzionalita e confini

- Lezioni ed esercizi su logica proposizionale e dei predicati.
- Configuratore di sessione, ripresa, scadenze e adattamento locale spiegabile.
- Forma parlata testuale delle formule, senza lettura vocale o sintesi audio delle domande.
- Percorsi di trasformazione dalla formula della domanda alla risposta corretta:
  ogni passaggio mostra legge generale, applicazione locale e formula ottenuta.
- Dashboard, quaderno errori ed export JSON/CSV basati sui dati del browser.
- Impostazioni accessibili per tema, dimensione testo e daltonismo.
- Laboratorio per analizzare formule, tabella di verita, AST e albero sintattico.
- Feedback anonimo e dati demografici opzionali con consensi separati.

## Requisiti

- Browser moderno con JavaScript, IndexedDB e SVG.
- Node.js 20 o successivo per i controlli di sviluppo.
- Docker con Compose v2 per l'avvio containerizzato.
- Un'istanza separata di TestLogica API per quiz e analisi del Laboratorio.

Non ci sono dipendenze npm da installare. Tutti i percorsi sono case-sensitive su
Linux; in particolare `Immagini/` usa la `I` maiuscola.

## Avvio rapido

Con l'API raggiungibile sulla porta host `5000`:

```bash
cp .env.example .env
docker compose up --build
```

Aprire <http://localhost:12345>. Il Compose aggiunge su Linux il mapping
`host.docker.internal:host-gateway`, quindi il valore predefinito
`http://host.docker.internal:5000` raggiunge un'API pubblicata sull'host.

Controlli utili:

```bash
npm run verify
docker compose config
docker build .
```

`/web-health` controlla soltanto Nginx e viene usato dall'healthcheck del container.
`/health` e invece inoltrato all'API e ne riflette la disponibilita.

## Configurazione

Copiare `.env.example` in `.env` e modificare solo i valori necessari:

| Variabile | Default | Responsabilita |
| --- | --- | --- |
| `WEB_PORT` | `12345` | Porta HTTP pubblicata dal container web. |
| `API_UPSTREAM` | `http://host.docker.internal:5000` | Origine dell'API usata dal proxy `/api/*` e da `/health`. |
| `REVIEW_UPSTREAM` | `http://host.docker.internal:5555` | Servizio opzionale che riceve `/api/revisione`. |

Se API e Web sono collegati a una stessa rete Docker, impostare
`API_UPSTREAM` con il nome DNS del servizio API. L'assenza di
`REVIEW_UPSTREAM` rende indisponibile soltanto l'invio volontario della revisione;
non impedisce lezioni, quiz o Laboratorio.

Il browser usa URL relativi `/api/...`: Nginx evita CORS e mixed content e inoltra
le richieste all'origine configurata. La Content Security Policy consente soltanto
risorse locali e connessioni alla stessa origine web.

## Struttura del repository

| Percorso | Contenuto e responsabilita esclusiva |
| --- | --- |
| `.github/` | Workflow CI: verifica Node e build dell'immagine Docker. |
| `Errori_comuni/` | Schede editoriali statiche sugli errori ricorrenti; non contiene gli errori personali. |
| `Immagini/` | Immagini semantiche e diagrammi usati nelle domande visuali. |
| `esercizi/` | Configurazione, esecuzione, correzione e risultato delle sessioni quiz. |
| `grafici/` | Galleria di PNG statistici pre-calcolati e relativo lightbox. |
| `grafici/accuracy/` | Accuratezza per tipologia, difficolta e radar delle competenze. |
| `grafici/advanced/` | Curve di apprendimento, regressioni e proiezioni. |
| `grafici/behavioral/` | Analisi aggregate del comportamento nelle sessioni. |
| `grafici/demographics/` | Grafici aggregati dei gruppi demografici autorizzati. |
| `grafici/general/` | Riepiloghi generali di risposte corrette ed errate. |
| `grafici/temporal/` | Andamenti temporali di accuratezza e velocita. |
| `grafici/timings/` | Distribuzioni e relazioni dei tempi di risposta. |
| `lezioni/` | Sei contenuti didattici sequenziali con verifiche locali. |
| `nginx/` | Template del server statico, proxy API, header di sicurezza e healthcheck. |
| `progressi/` | Dashboard personale calcolata da IndexedDB con filtri ed export. |
| `ripasso/` | Quaderno personale e deduplicato degli errori salvati. |
| `scripts/` | Codice runtime del browser: storage, quiz, lezioni, rendering e servizi pagina. |
| `strumenti/` | Laboratorio di logica interattivo; non contiene il flusso quiz. |
| `styles/` | Token, componenti storici e fogli specifici per quiz, strumenti e grafici. |
| `tests/` | Test Node di contratti, storage, sicurezza, accessibilita e regressione. |
| `tools/` | Verifiche statiche eseguite da npm; non viene pubblicato da Nginx. |

I file HTML alla radice hanno ruoli trasversali: `index.html` e la home e
`privacy.html` gestisce informativa e consensi. `service-worker.js` non e una
funzione PWA: e un tombstone temporaneo, privo di handler `fetch`, che cancella le
cache `testlogica-*` e si deregistra sui browser controllati da release precedenti.
Il codice attuale non registra alcun service worker e non cancella IndexedDB o
`localStorage` durante questa migrazione.

### Cartelle con nomi o dati affini

- `Errori_comuni/` e materiale pubblico uguale per tutti; `ripasso/` legge soltanto
  gli errori personali del browser.
- `grafici/` contiene immagini editoriali gia generate; `progressi/` calcola dal
  vivo indicatori ed SVG dai tentativi locali.
- `Immagini/` contiene asset didattici delle domande; `styles/` non deve incorporare
  dati o logica applicativa.
- `scripts/` e runtime servito al browser; `tools/` e tooling di sviluppo.
- `esercizi/` possiede la sessione guidata; `strumenti/` offre analisi libera di una
  formula e non salva risultati del quiz.

Questi confini evitano duplicazioni senza rinominare URL pubblici gia usati dal
progetto precedente.

## Moduli principali

- `scripts/app.js`: bootstrap globale e rimozione selettiva delle vecchie cache PWA.
- `scripts/app-storage.js`, `privacy-controls.js`, `data-contracts.js`: IndexedDB,
  consensi e contratti versionati.
- `scripts/quiz.js` e moduli `quiz-*`: configurazione, richieste batch, stato,
  rendering, timer, ripresa, feedback e report.
- `scripts/formula-transformation*.js`: valida e rende la derivazione autentica
  dalla formula iniziale alla risposta; non la confonde con la costruzione AST.
- `scripts/formula-construction*.js` e `formula-tree.js`: struttura sintattica usata
  dal Laboratorio e dagli alberi.
- `scripts/logic-sandbox.js`: controller del Laboratorio.
- `scripts/dashboard.js`, `error-notebook*.js`, `results-export.js`: viste personali
  ed export dei dati autorizzati.

Gli stili globali sono in `styles/base.css` e `styles/components.css`; ogni area
aggiunge un foglio dedicato. Il Laboratorio riusa token, tipografia monospaziata,
box arrotondati e stati focus del sito invece di introdurre un design separato.

## Dati, privacy e scadenze

I consensi per salvataggio locale, feedback anonimo e dati demografici sono
indipendenti e inizialmente disattivati. Prima del consenso non vengono creati
record applicativi in IndexedDB. Sessioni incomplete scadono dopo 30 giorni;
tentativi, errori e sessioni concluse dopo un anno. Le impostazioni permettono
cancellazione selettiva e totale ed emettono eventi che aggiornano le viste aperte.

## Verifica e CI

`npm run verify` esegue il controllo sintattico di tutti gli script e l'intera suite
Node. La CI in `.github/workflows/ci.yml` ripete la verifica su Node 20 e costruisce
l'immagine Docker. I test includono percorsi Linux case-sensitive, CSP, contratti
API, storage, cancellazione, flussi quiz, trace delle formule e dismissione PWA.

## Licenza

Nel materiale ricevuto non e presente una licenza.
