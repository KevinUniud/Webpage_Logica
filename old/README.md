# Webpage - Logica Proposizionale e Predicati

Questo progetto contiene una piccola web app didattica in HTML/CSS/JavaScript per lezioni ed esercizi di logica.

## Struttura principale

- `index.html`: home del progetto.
- `lezioni/`: pagine lezione (`lezione-1.html` ... `lezione-6.html`).
- `esercizi/esercitazione.html`: pagina del quiz dinamico.
- `scripts/`: logica JS dell'app.
- `styles/`: stili globali e del quiz.
- `Immagini/`: asset grafici usati nei quiz visuali.

## Moduli JavaScript

- `scripts/app.js`
  - Bootstrap globale pagina.
  - Inizializza settings e navigazione radio delle lezioni.
  - Gestisce i pulsanti rapidi per inserire simboli nelle espressioni.

- `scripts/settings.js`
  - Crea e gestisce il modal impostazioni.
  - Salva su `localStorage` tema, font e modalita daltonismo.
  - Pubblica eventi per opzioni specifiche esercizi.

- `scripts/quiz.js`
  - Motore principale del quiz (caricamento esercizi, timer, verifica, recap).
  - Supporta modalita equivalenza, valore di verita, negazione quantificatori.
  - Applica trasformazioni formula/parlato e rendering opzioni.

- `scripts/quiz-shared.js`
  - Utility condivise (parse, conversione formule, random helpers).
  - Espone `window.quizShared` per moduli dipendenti.

- `scripts/lesson-checks.js`
  - Verifica dei quiz locali nelle lezioni.

- `scripts/lesson-radio.js`
  - Rendering custom e navigazione tastiera per radio button nelle lezioni.

- `scripts/quiz-images-question.js`, `scripts/quiz-images-correct.js`, `scripts/quiz-images-wrong.js`
  - Builder dei descriptor per rendering immagini formula (domanda/corretta/sbagliata).

## Fogli di stile

- `styles/base.css`
  - Design tokens globali, colori semantici, tema day/night, palette daltonismo.
  - Regole base tipografia/layout + utility accessibilita.

- `styles/components.css`
  - Componenti condivisi: pannello impostazioni, box, pulsanti, tabelle, navigazione lezioni.

- `styles/quiz.css`
  - Layout e stati del quiz (opzioni, status, recap, split formulas, responsive).

- `styles/quiz-images.css`
  - Sezione immagini didattiche per analisi risposte sbagliate.

- `styles/themes.css`
  - Punto di estensione per futuri override tema.

## Accessibilita

- Gestione (default 16px).
- Tema Night/Day.
- Modalita daltonismo: protanopia, deuteranopia, tritanopia, acromatopsia.
- Focus visibile tastiera e supporto preferenze utente (`prefers-reduced-motion`, `prefers-contrast`).
- Dialog impostazioni con focus trap ed escape.

## API esterne usate dal quiz

In `scripts/quiz.js` sono configurati endpoint HTTP per la generazione dinamica esercizi.

- Equivalenza formule.
- Valore di verita.

Se gli endpoint non sono raggiungibili, il quiz mostra un messaggio di errore in UI.

## Avvio locale

Non e richiesto build tool.

1. Apri `index.html` in un browser.
2. Vai su lezioni o esercizi.
3. Per il quiz dinamico assicurati che le API remote siano disponibili.