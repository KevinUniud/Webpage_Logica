/*
 * Motore principale del quiz equivalente/verita/negazione quantificatori.
 * Gestisce caricamento esercizi da API, rendering opzioni, verifica risposte,
 * timer, recap finale e modalita di visualizzazione/accessibilita.
 */

/**
 * Inizializza il quiz nel contenitore indicato.
 * @pre rootId punta a un elemento DOM esistente con la struttura attesa del quiz.
 * @post Event listener e stato interno vengono inizializzati; il quiz entra in intro o in caricamento diretto.
 */
function initEquivalentQuiz(rootId) {
        /**
         * Restituisce le opzioni attive (testi) mostrate all'utente per le domande.
         * @returns {string[]} Array dei testi delle opzioni attuali.
         */
        function getActiveOptions() { 
            const showFormulas = document.getElementById('quizShowFormulas')?.checked || false;
            const colorAtoms = document.getElementById('quizColorAtoms')?.checked || false;
            const spokenLanguage = document.getElementById('quizSpokenLanguage')?.checked || false;
            const showWrongActionImages = document.getElementById('quizShowWrongActionImages')?.checked || false;
            return {
                showFormulas,
                colorAtoms,
                spokenLanguage,
                showWrongActionImages
            };
        }
        const root = document.getElementById(rootId);
    if (!root) return;

    const EX_HIGHLIGHT_KEY = 'logic-exercises-highlight-atoms';
    const EX_PARENS_KEY = 'logic-exercises-differentiate-parens';
    const isExercisesPage = /\/esercizi\//.test(window.location.pathname);

    function readExerciseSetting(key) {
        return localStorage.getItem(key) === '1';
    }

    // Crea/recupera il display timer condiviso fissato a viewport.
    function ensureTimerDisplay() {
        let el = document.getElementById('quizTimerDisplay');
        if (el) return el;

        el = document.createElement('div');
        el.id = 'quizTimerDisplay';
        el.className = 'quiz-timer';
        el.hidden = true;
        el.textContent = '20:00';
        document.body.appendChild(el);
        return el;
    }

    const introEl = root.querySelector('#quizIntro');
    const startButton = root.querySelector('#quizStartButton');
    const questionCountInput = root.querySelector('#quizQuestionCount');
    const timeMinutesInput = root.querySelector('#quizTimeMinutes');
    const showFormulasInput = root.querySelector('#quizShowFormulas');
    const colorAtomsInput = root.querySelector('#quizColorAtoms');
    const spokenLanguageInput = root.querySelector('#quizSpokenLanguage');
    const showWrongActionImagesInput = root.querySelector('#quizShowWrongActionImages');
    const testEl = root.querySelector('#quizTest');
    const splitLayoutEl = document.getElementById('quizTestLayout') || root.querySelector('#quizTestLayout');
    const formulasPaneEl = document.getElementById('quizFormulasPane') || root.querySelector('#quizFormulasPane');
    const reviewEl = root.querySelector('#quizReview');
    const reviewListEl = root.querySelector('#quizReviewList');
    const reviewTitleEl = document.getElementById('quizReviewTitle') || root.querySelector('#quizReviewTitle');
    const reviewNavEl = document.getElementById('quizReviewNav') || root.querySelector('#quizReviewNav');
    const reviewRestartButton = document.getElementById('quizReviewRestart') || root.querySelector('#quizReviewRestart');
    const introTitleEl = document.getElementById('quizIntroTitle') || root.querySelector('#quizIntroTitle');
    const testTitleEl = document.getElementById('quizTestTitle') || root.querySelector('#quizTestTitle');
    const timerDisplayEl = ensureTimerDisplay();
    const questionEl = root.querySelector('#quizQuestion');
    const infoEl = root.querySelector('#quizInfo');
    const optionsEl = root.querySelector('#quizOptions');
    const actionButton = root.querySelector('#quizActionButton');
    const statusEl = root.querySelector('#quizStatus');
    const wrongActionImagesEl = root.querySelector('#quizWrongActionImages');

    if (!questionEl || !infoEl || !optionsEl || !actionButton || !statusEl) return;

    const DEFAULT_EXERCISES = 10;
    const DEFAULT_TIME_MINUTES = 20;
    let currentExercise = 0;
    let totalExercises = DEFAULT_EXERCISES;
    let standardTimeMinutes = DEFAULT_TIME_MINUTES;
    let timerSecondsRemaining = DEFAULT_TIME_MINUTES * 60;
    let timerIntervalId = null;
    const reviewResults = [];
    let currentQuestionInfo = [];
    let currentTruthAssignments = {};
    let atomSpokenMap = {};
    let currentSpokenNameColors = {};
    let currentQuestionText = '';
    let currentImageFormulaSteps = { question: [], correct: [], wrongByFormula: {} };
    let quantifierNegationTarget = 0;
    let quantifierNegationUsed = 0;
    var quizStartTimestamp = Date.now();
    var questionViewTimestamps = [];
    const FEEDBACK_FIELDS = [
        { id: 'expectation', payloadKey: 'Aspettative test', label: 'Il test è andato bene:' },
        { id: 'aidsUtility', payloadKey: 'Utilità ausili', label: 'Gli ausili mi hanno aiutato a svolgere il test:' },
        { id: 'lessonsUtility', payloadKey: 'Utilità lezioni', label: 'Le lezioni di introduzione sono state utili per affrontare il test:' },
        { id: 'testDifficulty', payloadKey: 'Difficoltà test', label: 'I test sono stati difficili:' },
        { id: 'control', payloadKey: 'Controllo', label: 'Gli ausili non sono stati utili durante il test:' }
    ];
    let feedbackValues = createEmptyFeedbackValues();
    const reviewSubmissionState = {
        inFlight: false,
        sent: false
    };

    /**
     * Converte un timestamp in formato leggibile: anno/mese/giorno ore:minuti:secondi
     * @param {number} timestamp - Timestamp in millisecondi
     * @returns {string} Data formattata
     */
    function formatDateTime(timestamp) {
        if (!timestamp || typeof timestamp !== 'number') return '';
        const date = new Date(timestamp);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
    }

    /**
     * Legge la modalità di logging e la scuola selezionata dalle impostazioni.
     * @returns {Object} Oggetto con mode e school
     */
    function getLogDataSettings() {
        const mode = localStorage.getItem('logDataMode') || 'none';
        let school = '';
        
        if (mode === 'dmif-uniud') {
            school = 'DMIF Uniud';
        }
        
        // else if (mode === 'altra-scuola') {
        //     school = 'Altra Scuola';
        // }
        
        return {
            mode: mode,
            school: school
        };
    }

    function createEmptyFeedbackValues() {
        return {
            expectation: '',
            aidsUtility: '',
            lessonsUtility: '',
            testDifficulty: '',
            control: ''
        };
    }

    function isFeedbackComplete() {
        return FEEDBACK_FIELDS.every(function(field) {
            return /^[1-5]$/.test(String(feedbackValues[field.id] || ''));
        });
    }

    function buildReviewReport(feedbackMap) {
        const logSettings = getLogDataSettings();
        const now = Date.now();
        const tempoTotale = quizStartTimestamp ? ((now - quizStartTimestamp) / 1000).toFixed(2) + 's' : '';
        const opzioniAttiveGlobali = reviewResults.length > 0 ? reviewResults[0].opzioniAttive : {};

        const feedbackPayload = {};
        FEEDBACK_FIELDS.forEach(function(field) {
            feedbackPayload[field.payloadKey] = String(feedbackMap[field.id] || '');
        });

        return {
            "Initial Data": {
                "Scuola": logSettings.school,
                "Tempo inizio esercitazione": formatDateTime(quizStartTimestamp),
                "Tempo totale": tempoTotale,
                "Totale domande": reviewResults.length,
                "Totale domande corrette": reviewResults.filter(function(e) { return e.isCorrect; }).length,
                "Totale domande errate": reviewResults.filter(function(e) { return !e.isCorrect; }).length,
                "Opzioni attive": opzioniAttiveGlobali
            },
            "Domande": reviewResults.map(function(entry, idx) {
                return {
                    ["Domanda nº " + (idx + 1)]: {
                        "Tipologia": entry.tipoDomanda || '',
                        "Tempo impiegato per rispondere": typeof entry.tempoRisposta === 'string' ? entry.tempoRisposta : '',
                        "Risposta è corretta": entry.isCorrect ? 'Sì' : 'No',
                        "Domanda": entry.question,
                        "Risposte": entry.risposteMostrate || '',
                        "Riposta utente": entry.selectedAnswer,
                        "Riposta corretta": entry.correctAnswer
                    }
                };
            }),
            "Feedback": feedbackPayload
        };
    }

    function submitReviewReport(report) {
        if (reviewSubmissionState.inFlight || reviewSubmissionState.sent) {
            return Promise.resolve(reviewSubmissionState.sent);
        }

        reviewSubmissionState.inFlight = true;
        return fetch('/api/revisione', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(report)
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            reviewSubmissionState.sent = true;
            console.log('Dati revisione inviati:', data);
            return true;
        })
        .catch(function(err) {
            console.error('Errore invio revisione:', err);
            return false;
        })
        .finally(function() {
            reviewSubmissionState.inFlight = false;
        });
    }

    function maybeAutoSubmitFeedback(statusNode, continueButton, radioNodes, submitNow) {
        if (reviewSubmissionState.sent) return;
        if (!isFeedbackComplete()) {
            statusNode.textContent = 'Completa tutte le risposte (1-5) per inviare il feedback.';
            statusNode.className = 'quiz-review-line';
            if (continueButton) continueButton.disabled = true;
            return;
        }
        if (continueButton) continueButton.disabled = false;
        if (!submitNow || reviewSubmissionState.inFlight) return;

        statusNode.textContent = 'Invio feedback in corso...';
        statusNode.className = 'quiz-review-line';
        if (continueButton) continueButton.disabled = true;

        submitReviewReport(buildReviewReport(feedbackValues)).then(function(ok) {
            if (!ok) {
                statusNode.textContent = 'Errore invio feedback. Modifica una risposta per riprovare.';
                statusNode.className = 'quiz-review-line quiz-review-answer is-wrong';
                if (continueButton) continueButton.disabled = false;
                return;
            }
            statusNode.textContent = 'Feedback inviato correttamente.';
            statusNode.className = 'quiz-review-line quiz-review-answer is-correct';
            radioNodes.forEach(function(radio) {
                radio.disabled = true;
            });
            setTimeout(function() {
                showReviewPage();
            }, 250);
        });
    }

    function renderFeedbackPage() {
        if (!reviewListEl) return;
        reviewListEl.innerHTML = '';
        reviewListEl.classList.add('quiz-feedback-panel');

        const radioNodes = [];
        FEEDBACK_FIELDS.forEach(function(field) {
            const row = document.createElement('div');
            row.className = 'quiz-feedback-row';

            const rowLabel = document.createElement('p');
            rowLabel.className = 'quiz-review-line';
            rowLabel.textContent = field.label;
            row.appendChild(rowLabel);

            const radioGroup = document.createElement('div');
            radioGroup.className = 'quiz-feedback-radio-group';

            for (let value = 1; value <= 5; value += 1) {
                const choice = document.createElement('label');
                choice.className = 'quiz-feedback-radio-choice';

                const radio = document.createElement('input');
                radio.type = 'radio';
                radio.name = 'feedback-' + field.id;
                radio.value = String(value);
                radio.setAttribute('aria-label', field.label + ' ' + String(value));
                if (String(feedbackValues[field.id] || '') === String(value)) {
                    radio.checked = true;
                }
                radio.addEventListener('change', function() {
                    if (!radio.checked) return;
                    feedbackValues[field.id] = String(radio.value || '');
                    maybeAutoSubmitFeedback(statusLine, continueButton, radioNodes, false);
                });

                const valueText = document.createElement('span');
                valueText.textContent = String(value);

                choice.appendChild(radio);
                choice.appendChild(valueText);
                radioGroup.appendChild(choice);
                radioNodes.push(radio);
            }

            row.appendChild(radioGroup);

            const endpoints = document.createElement('div');
            endpoints.className = 'quiz-feedback-endpoints';
            const left = document.createElement('span');
            left.textContent = '1 Per niente d\'accordo';
            const right = document.createElement('span');
            right.textContent = '5 Totalmente d\'accordo';
            endpoints.appendChild(left);
            endpoints.appendChild(right);
            row.appendChild(endpoints);

            reviewListEl.appendChild(row);
        });

        const statusLine = document.createElement('p');
        statusLine.className = 'quiz-review-line';
        reviewListEl.appendChild(statusLine);

        const continueButton = document.createElement('button');
        continueButton.type = 'button';
        continueButton.className = 'btn-wide quiz-feedback-continue';
        continueButton.textContent = 'Continua';
        continueButton.disabled = true;
        continueButton.addEventListener('click', function() {
            maybeAutoSubmitFeedback(statusLine, continueButton, radioNodes, true);
        });
        reviewListEl.appendChild(continueButton);

        maybeAutoSubmitFeedback(statusLine, continueButton, radioNodes, false);
    }

    function renderReviewList() {
        if (!reviewListEl) return;
        reviewListEl.innerHTML = '';
        reviewListEl.classList.remove('quiz-feedback-panel');

        reviewResults.forEach(function(entry) {
            const item = document.createElement('div');
            item.className = 'quiz-review-item';

            const title = document.createElement('p');
            title.className = 'quiz-review-title';
            title.textContent = 'Domanda ' + String(entry.number);

            const questionLine = document.createElement('p');
            questionLine.className = 'quiz-review-line';
            questionLine.textContent = 'Testo domanda: ' + entry.question;

            let infoBlock = null;
            if (Array.isArray(entry.infoLines) && entry.infoLines.length > 0) {
                infoBlock = document.createElement('div');
                infoBlock.className = 'quiz-review-hypotheses';

                const infoTitle = document.createElement('p');
                infoTitle.className = 'quiz-review-line';
                infoTitle.textContent = 'Ipotesi:';

                const infoList = document.createElement('ul');
                entry.infoLines.forEach(function(line) {
                    const li = document.createElement('li');
                    li.textContent = line;
                    infoList.appendChild(li);
                });

                infoBlock.appendChild(infoTitle);
                infoBlock.appendChild(infoList);
            }

            const userLine = document.createElement('p');
            userLine.className = 'quiz-review-line';
            userLine.appendChild(document.createTextNode('Risposta data: '));

            const userAnswer = document.createElement('span');
            userAnswer.className = 'quiz-review-answer ' + (entry.isCorrect ? 'is-correct' : 'is-wrong');
            userAnswer.textContent = entry.selectedAnswer;
            userLine.appendChild(userAnswer);

            const correctLine = document.createElement('p');
            correctLine.className = 'quiz-review-line';
            correctLine.textContent = 'Risposta corretta: ' + entry.correctAnswer;

            item.appendChild(title);
            item.appendChild(questionLine);
            if (infoBlock) item.appendChild(infoBlock);
            item.appendChild(userLine);
            item.appendChild(correctLine);
            reviewListEl.appendChild(item);
        });
    }

    function showReviewPage() {
        if (reviewTitleEl) {
            reviewTitleEl.hidden = false;
            reviewTitleEl.textContent = 'Revisione Test';
        }
        renderReviewList();
        if (reviewNavEl) reviewNavEl.hidden = false;
    }

    function normalizeApiBase(rawBase) {
        const base = String(rawBase || '').trim();
        if (!base) return '/api';
        return base.replace(/\/+$/, '');
    }

    function buildApiUrl(path) {
        const cleanPath = String(path || '').replace(/^\/+/, '');
        return normalizeApiBase(window.LOGIC_API_BASE_URL) + '/' + cleanPath;
    }

    const equivalenceApiUrl = buildApiUrl('generator/build-exercise-from-depth');
    const truthApiUrl = buildApiUrl('generator/build-truth-value-options-question');
    const logicalConsequenceApiUrl = buildApiUrl('generator/build-logical-consequence-question');
    const translationApiUrl = buildApiUrl('generator/build-translation-question');
    const formulaByVariableCountApiUrl = buildApiUrl('generator/generate-formula-by-variable-count');

    const variableSets = [
        ['p', 'q', 'r'],
        ['p', 'q', 'r', 's']
    ];

    const NOMI = ['Luca', 'Matteo', 'Alessandro', 'Marco', 'Davide', 'Giulia', 'Sofia', 'Martina', 'Chiara', 'Elisa'];
    const AZIONI = ['nuota', 'corre', 'salta', 'guarda', 'parla', 'apre la porta', 'chiude', 'ascolta'];
    const ACTION_IMAGE_FILES = {
        nuota: { day: 'Nuotare_White.png', night: 'Nuotare_Black.png' },
        corre: { day: 'Correre_White.png', night: 'Correre_Black.png' },
        salta: { day: 'Saltare_White.png', night: 'Saltare_Black.png' },
        guarda: { day: 'Guardare_White.png', night: 'Guardare_Black.png' },
        parla: { day: 'Parlare_White.png', night: 'Parlare_Black.png' },
        apre: { day: 'Aprire_White.png', night: 'Aprire_Black.png' },
        'apre la porta': { day: 'Aprire_White.png', night: 'Aprire_Black.png' },
        chiude: { day: 'Chiudere_White.png', night: 'Chiudere_Black.png' },
        ascolta: { day: 'Ascoltare_White.png', night: 'Ascoltare_Black.png' }
    };

    const state = {
        mode: 'check',
        selectedIndex: 0,
        options: [],
        correctIndex: -1,
        locked: false,
        spokenlanguageLocked: false,
        exerciseKind: 'equivalence',
        showFormulas: false,
        colorAtoms: false,
        showWrongActionImages: false,
        highlightAtoms: isExercisesPage ? readExerciseSetting(EX_HIGHLIGHT_KEY) : false,
        differentiateParens: isExercisesPage ? readExerciseSetting(EX_PARENS_KEY) : false,
        spokenlanguage: false
    };

    const quizShared = window.quizShared;
    if (!quizShared) {
        throw new Error('Modulo quiz-shared.js non caricato');
    }
    const differentiateParentheses = quizShared.differentiateParentheses;
    const parsePositiveInt = quizShared.parsePositiveInt;
    const prologToLogical = quizShared.prologToLogical;
    const shuffle = quizShared.shuffle;
    const pickRandom = quizShared.pickRandom;
    const normalizeNameKey = quizShared.normalizeNameKey;
    const isGenericPersonLabel = quizShared.isGenericPersonLabel;

    const NAME_COLOR_PALETTE_DAY = [
        '#0057B8', '#ca6c1e', '#0B6E4F', '#B91C1C'
    ];
    const NAME_COLOR_PALETTE_NIGHT = [
        '#7DD3FC', '#fcb160', '#86EFAC', '#FCA5A5'
    ];

    // === Caches for performance optimization (Phase 2-3) ===
    // Cache for buildImageSequenceFromFormula results: key is formula+mode, value is sequence array
    var formulaSequenceCache = {};
    
    // Cache for applyFormulaTransforms results: key is formula+flags, value is transformed formula
    var formulaTransformsCache = {};
    
    // Cache for colorizeAtomsInText results: key is formula+colorMap, value is HTML string
    var colorizeAttentionCache = {};

    function getCachedFormulaSequence(formula, mode) {
        var cacheKey = formula + '|' + mode;
        if (formulaSequenceCache.hasOwnProperty(cacheKey)) {
            return formulaSequenceCache[cacheKey];
        }
        var sequence = buildImageSequenceFromFormula(formula, mode);
        formulaSequenceCache[cacheKey] = sequence;
        return sequence;
    }

    function getCachedFormulaTransforms(formula) {
        // Cache key includes formula and current state flags (since applyFormulaTransforms uses state)
        var flagKey = (state.differentiateParens ? '1' : '0') + (state.spokenlanguage ? '1' : '0');
        var cacheKey = formula + '|' + flagKey;
        if (formulaTransformsCache.hasOwnProperty(cacheKey)) {
            return formulaTransformsCache[cacheKey];
        }
        var transformed = applyFormulaTransforms(formula);
        formulaTransformsCache[cacheKey] = transformed;
        return transformed;
    }

    function clearFormulaSequenceCaches() {
        formulaSequenceCache = {};
        formulaTransformsCache = {};
        colorizeAttentionCache = {};
    }

    function isDayMode() {
        return document.documentElement.classList.contains('day-mode') || document.body.classList.contains('day-mode');
    }

    // Pulisce il pannello immagini legato alle risposte errate.
    function clearWrongActionImages() {
        if (!wrongActionImagesEl) return;
        wrongActionImagesEl.innerHTML = '';
        wrongActionImagesEl.hidden = true;
    }

    function syncWrongImagesWidth() {
        if (!wrongActionImagesEl || !questionEl) return;
        const questionLength = String(questionEl.textContent || '').trim().length;
        const widthCh = Math.max(40, Math.min(questionLength || 40, 80));
        wrongActionImagesEl.style.setProperty('--quiz-wrong-images-max-ch', String(widthCh));
    }

    function resolveImageCandidates(action, mode) {
        const item = ACTION_IMAGE_FILES[action];
        if (!item) return [];
        const raw = item[mode];
        if (Array.isArray(raw)) return raw;
        if (typeof raw === 'string') return [raw];
        return [];
    }

    function resetSpokenNameColors() {
        currentSpokenNameColors = {};
    }

    function buildSpokenNameColorMap() {
        const palette = isDayMode() ? NAME_COLOR_PALETTE_DAY : NAME_COLOR_PALETTE_NIGHT;
        const assigned = {};

        Object.keys(atomSpokenMap || {}).forEach(function(atom) {
            const entry = atomSpokenMap[atom];
            if (!entry || !entry.nome) return;
            const nameKey = normalizeNameKey(entry.nome);
            if (!nameKey || Object.prototype.hasOwnProperty.call(assigned, nameKey)) return;

            const colorIndex = Object.keys(assigned).length % palette.length;
            assigned[nameKey] = palette[colorIndex];
        });

        currentSpokenNameColors = assigned;
    }

    function resolveNameCaptionColor(name) {
        const nameKey = normalizeNameKey(name);
        if (!nameKey) return '';
        return currentSpokenNameColors[nameKey] || '';
    }

    function connectorText(symbol) {
        const map = {
            '∧': 'E',
            '∨': 'O',
            '→': 'IMPLICA',
            '↔': 'SE E SOLO SE'
        };
        return map[symbol] || symbol;
    }

    function extractFormulaFromQuestionText(text) {
        const question = String(text || '');
        const match = question.match(/"([^"]+)"/);
        if (!match) return '';
        return String(match[1] || '').trim();
    }

    function tokenizeFormulaForImages(formula) {
        let normalized = String(formula || '');
        if (state.differentiateParens) {
            normalized = differentiateParentheses(normalized);
        }
        return normalized.match(/\(|\)|\[|\]|\{|\}|¬|↔|→|∧|∨|∀\s*[A-Za-z][A-Za-z0-9_]*|∃\s*[A-Za-z][A-Za-z0-9_]*|[A-Za-z][A-Za-z0-9_]*/g) || [];
    }

    function isPredicateApplicationParenthesis(tokens, index) {
        if (!Array.isArray(tokens)) return false;
        const current = tokens[index];
        if (current !== '(' && current !== ')') return false;

        if (current === '(') {
            const left = tokens[index - 1] || '';
            const right = tokens[index + 1] || '';
            const rightAfter = tokens[index + 2] || '';
            return /^[A-Za-z][A-Za-z0-9_]*$/.test(left) && /^[A-Za-z][A-Za-z0-9_]*$/.test(right) && rightAfter === ')';
        }

        const left = tokens[index - 1] || '';
        const open = tokens[index - 2] || '';
        const predicate = tokens[index - 3] || '';
        return open === '(' && /^[A-Za-z][A-Za-z0-9_]*$/.test(left) && /^[A-Za-z][A-Za-z0-9_]*$/.test(predicate);
    }

    function removePredicateApplicationParentheses(text) {
        return String(text || '').replace(/\b([A-Za-z][A-Za-z0-9_]*)\s*\(\s*([A-Za-z][A-Za-z0-9_]*)\s*\)/g, function(_, predicate, variable) {
            return predicate + ' ' + variable;
        });
    }

    // Trasforma una formula in sequenza di token renderizzabili come immagini/connettivi.
    function buildImageSequenceFromFormula(formula, mode) {
        const tokens = tokenizeFormulaForImages(formula);
        if (tokens.length === 0) return [];

        const sequence = [];

        tokens.forEach(function(token, index) {
            const t = String(token || '').trim();
            if (!t) return;

            if (t === '¬') {
                sequence.push({ type: 'connector', text: 'NON', logicKey: 'OP:NOT' });
                return;
            }

            if (t === '∧' || t === '∨' || t === '→' || t === '↔') {
                sequence.push({ type: 'connector', text: connectorText(t), logicKey: 'OP:' + t });
                return;
            }

            if (t === '(' || t === ')' || t === '[' || t === ']' || t === '{' || t === '}') {
                if (isPredicateApplicationParenthesis(tokens, index)) {
                    return;
                }
                sequence.push({ type: 'parenthesis', text: t, logicKey: 'PAREN:' + t });
                return;
            }

            const quantifierMatch = t.match(/^(∀|∃)\s*([A-Za-z][A-Za-z0-9_]*)$/);
            if (quantifierMatch) {
                const q = quantifierMatch[1];
                const qText = q === '∀' ? 'PER OGNI' : 'ESISTE';
                sequence.push({ type: 'connector', text: qText, logicKey: 'Q:' + q });
                return;
            }

            const entry = atomSpokenMap[t] || atomSpokenMap[t.toLowerCase()];
            if (!entry) return;

            const action = String(entry.azione || '').toLowerCase();
            const candidates = resolveImageCandidates(action, mode);
            if (candidates.length === 0) return;

            sequence.push({
                type: 'image',
                atom: t,
                candidates: candidates,
                nome: String(entry.nome || ''),
                azione: action,
                logicKey: 'ATOM:' + t.toLowerCase()
            });
        });

        return sequence;
    }

    function appendImageNode(container, item, extraClass) {
        const node = document.createElement('div');
        node.className = 'quiz-wrong-images-item' + (extraClass ? ' ' + extraClass : '');

        const img = document.createElement('img');
        img.className = 'quiz-wrong-images-img';
        img.alt = item.atom;
        img.loading = 'lazy';

        let candidateIndex = 0;
        function setCandidate(idx) {
            if (idx >= item.candidates.length) {
                node.remove();
                return;
            }
            img.src = '../Immagini/' + item.candidates[idx];
        }

        img.addEventListener('error', function() {
            candidateIndex += 1;
            setCandidate(candidateIndex);
        });

        const caption = document.createElement('span');
        caption.className = 'quiz-wrong-images-caption';
        const captionSubject = item.nome;
        const captionAction = state.spokenlanguage
            ? formatSpokenAction(item.azione, false)
            : item.azione;

        const subjectText = String(captionSubject || '').trim();
        const actionText = String(captionAction || '').trim();

        const subjectNode = document.createElement('span');
        subjectNode.className = 'quiz-wrong-images-caption-subject';
        subjectNode.textContent = subjectText;

        if (subjectText && !isGenericPersonLabel(subjectText)) {
            const subjectColor = resolveNameCaptionColor(subjectText);
            if (subjectColor) subjectNode.style.color = subjectColor;
        }

        const actionNode = document.createElement('span');
        actionNode.className = 'quiz-wrong-images-caption-action';
        actionNode.textContent = actionText;

        if (subjectText) {
            caption.appendChild(subjectNode);
        }
        if (subjectText && actionText) {
            caption.appendChild(document.createTextNode(' '));
        }
        if (actionText) {
            caption.appendChild(actionNode);
        }

        node.appendChild(img);
        node.appendChild(caption);
        container.appendChild(node);
        setCandidate(candidateIndex);
    }

    /**
     * Aggiunge un connettivo testuale alla riga immagini.
     * @pre container e un nodo DOM valido.
     * @post Se text non e vuoto viene aggiunto uno span con classe connettore.
     */
    function appendConnectorNode(container, text, extraClass) {
        const connector = document.createElement('span');
        connector.className = 'quiz-wrong-images-connector' + (extraClass ? ' ' + extraClass : '');
        connector.textContent = String(text || '').trim();
        if (!connector.textContent) return;
        container.appendChild(connector);
    }

    /**
     * Aggiunge un simbolo di parentesi alla riga immagini.
     * @pre container e un nodo DOM valido.
     * @post Se text non e vuoto viene aggiunto uno span parentesi.
     */
    function appendParenthesisNode(container, text, extraClass) {
        const paren = document.createElement('span');
        paren.className = 'quiz-wrong-images-parenthesis' + (extraClass ? ' ' + extraClass : '');
        paren.textContent = String(text || '').trim();
        if (!paren.textContent) return;
        container.appendChild(paren);
    }

    /**
     * Determina la classe di evidenziazione confronto step per step.
     * @pre sequence e referenceSequence sono sequenze allineate per indice o vuote.
     * @post Restituisce una classe CSS coerente con highlightKind oppure stringa vuota.
     */
    function resolveStepHighlightClass(sequence, index, referenceSequence, highlightKind) {
        if (!referenceSequence || referenceSequence.length === 0 || !highlightKind) return '';
        const current = sequence[index];
        const reference = referenceSequence[index];
        const isSame = Boolean(reference && current && reference.logicKey === current.logicKey);
        if (isSame) return '';
        if (highlightKind === 'changed') return 'is-step-changed';
        if (highlightKind === 'error') return 'is-step-error';
        return '';
    }

    /**
     * Uniforma diverse forme di step-log in un array di stringhe formula.
     * @pre raw puo essere array eterogeneo (stringhe/oggetti) o altro valore.
     * @post Restituisce sempre un array filtrato di stringhe non vuote.
     */
    function normalizeGenerationSteps(raw) {
        if (!Array.isArray(raw)) return [];
        return raw.map(function(step) {
            if (typeof step === 'string') return step;
            if (!step || typeof step !== 'object') return '';
            return step.formula_prolog || step.formula || step.expr || step.step || '';
        }).filter(function(step) {
            return Boolean(step);
        });
    }

    /**
     * Estrae la formula sorgente di un'opzione privilegiando il primo step disponibile.
     * @pre option e un oggetto opzione o valore nullo.
     * @post Restituisce una stringa formula (o vuota in fallback).
     */
    function getOptionFormulaSource(option) {
        if (!option || typeof option !== 'object') return '';
        const steps = normalizeGenerationSteps(option.formulaSteps);
        if (steps.length > 0) return steps[0];
        return '';
    }

    /**
     * Restituisce la formula da mostrare in UI per una singola opzione.
     * @pre option e un oggetto opzione compatibile.
     * @post Restituisce sempre una stringa renderizzabile in notazione utente.
     */
    function getOptionDisplayFormula(option) {
        return displayFormulaText(getOptionFormulaSource(option));
    }

    /**
     * Estrae e normalizza i passi di generazione delle risposte sbagliate.
     * @pre res e il payload backend (o sua porzione), wrongs e un array formule.
     * @post Restituisce una mappa formula -> array passi (anche vuoto se non presenti dati).
     */
    function extractWrongStepsMap(res, wrongs) {
        const map = {};
        if (!res || !Array.isArray(wrongs)) return map;

        if (Array.isArray(res.wrong_answers_generation_steps)) {
            res.wrong_answers_generation_steps.forEach(function(entry, index) {
                if (!entry) return;
                if (Array.isArray(entry)) {
                    return;
                }
                if (typeof entry === 'string') {
                    return;
                }
                const formula = entry.formula_prolog || entry.formula || '';
                const steps = normalizeGenerationSteps(entry.generation_steps || entry.steps || entry.path);
                if (formula) map[formula] = steps;
            });
        }

        return map;
    }

    /**
     * Formatta un passo formula per visualizzazione fallback testuale.
     * @pre step e una stringa formula o valore convertibile.
     * @post Restituisce stringa simbolica e, se attivo, con parentesi differenziate.
     */
    function formatStepFormulaText(step) {
        const source = String(step || '').trim();
        if (!source) return '';

        // Step-log entries are usually Prolog formulas; force symbolic rendering here.
        let text = prologToLogical(source);
        if (!text) {
            text = displayFormulaText(source);
        }
        text = normalizeFormulaAtoms(text);
        if (state.differentiateParens) {
            text = differentiateParentheses(text);
        }
        return text;
    }

    /**
     * Renderizza una sezione immagini (domanda/corretta/sbagliata).
     * @pre parent e un nodo contenitore; descriptor contiene almeno title e formulaText.
     * @post Appende al parent una section completa con fallback testuale se necessario.
     */
    function renderImageFileSection(parent, descriptor, mode, options) {
        const section = document.createElement('section');
        section.className = 'quiz-wrong-images-file';

        const title = document.createElement('h4');
        title.className = 'quiz-wrong-images-file-title';
        title.textContent = descriptor.title;
        section.appendChild(title);

        if (options && options.badgeText) {
            const badge = document.createElement('p');
            badge.className = 'quiz-wrong-images-badge';
            badge.textContent = options.badgeText;
            section.appendChild(badge);
        }

        const row = document.createElement('div');
        row.className = 'quiz-wrong-images-row';
        const allowImages = Boolean(options && options.allowImages);
        // Use cached sequence to avoid repeated tokenization of the same formula
        const sequence = allowImages ? getCachedFormulaSequence(descriptor.formulaText, mode) : [];
        if (sequence.length === 0) {
            const empty = document.createElement('span');
            empty.className = 'quiz-wrong-images-empty';
            const fallbackFormula = formatStepFormulaText(descriptor.formulaText);
            empty.textContent = removePredicateApplicationParentheses(fallbackFormula) || 'Nessuna formula disponibile.';
            row.appendChild(empty);
        } else {
            sequence.forEach(function(item, index) {
                const extraClass = resolveStepHighlightClass(
                    sequence,
                    index,
                    options && options.referenceSequence,
                    options && options.highlightKind
                );
                if (item.type === 'connector') {
                    appendConnectorNode(row, item.text, extraClass);
                    return;
                }
                if (item.type === 'parenthesis') {
                    appendParenthesisNode(row, item.text, extraClass);
                    return;
                }
                appendImageNode(row, item, extraClass);
            });
        }

        section.appendChild(row);
        if (options && options.legendText) {
            const legend = document.createElement('p');
            legend.className = 'quiz-wrong-images-legend';
            legend.textContent = options.legendText;
            section.appendChild(legend);
        }
        parent.appendChild(section);
    }

    /**
     * Compone l'elenco descriptor immagini usando i builder registrati su window.
     * @pre context contiene i dati formula correnti della domanda.
     * @post Restituisce un array di descriptor validi con almeno un titolo.
     */
    function buildImageFileDescriptors(context) {
        const descriptors = [];
        if (typeof window.quizQuestionImageFileBuilder === 'function') {
            descriptors.push(window.quizQuestionImageFileBuilder(context));
        }
        if (typeof window.quizCorrectImageFileBuilder === 'function') {
            descriptors.push(window.quizCorrectImageFileBuilder(context));
        }
        if (typeof window.quizWrongImageFileBuilder === 'function') {
            descriptors.push(window.quizWrongImageFileBuilder(context));
        }
        return descriptors.filter(function(item) {
            return item && typeof item.title === 'string';
        });
    }

    /**
     * Renderizza i blocchi immagini contestuali alla risposta corrente.
     * @pre Lo stato quiz corrente e coerente (selectedIndex/correctIndex validi quando disponibili).
     * @post Il pannello immagini e aggiornato oppure nascosto se non applicabile.
     */
    function renderWrongActionImages(isCorrect) {
        if (!wrongActionImagesEl) return;
        clearWrongActionImages();

        const shouldRenderImages = Boolean(state.showWrongActionImages && state.spokenlanguage);
        if (!shouldRenderImages) return;

        const mode = isDayMode() ? 'day' : 'night';
        const selectedOption = state.options[state.selectedIndex] || null;
        const correctOption = state.options[state.correctIndex] || null;
        const fallbackWrongOption = state.options.find(function(option) {
            return option && option.correct === false;
        }) || null;

        const wrongOption = isCorrect ? fallbackWrongOption : selectedOption;
        const context = {
            questionText: currentQuestionText,
            questionFormulaText: extractFormulaFromQuestionText(currentQuestionText),
            correctFormulaText: correctOption ? getOptionDisplayFormula(correctOption) : '',
            wrongFormulaText: wrongOption ? getOptionDisplayFormula(wrongOption) : '',
            questionFormulaSteps: currentImageFormulaSteps.question || [],
            correctFormulaSteps: currentImageFormulaSteps.correct || [],
            wrongFormulaSteps: wrongOption && currentImageFormulaSteps.wrongByFormula
                ? (currentImageFormulaSteps.wrongByFormula[wrongOption.text] || [])
                : []
        };

        const descriptors = buildImageFileDescriptors(context);
        if (descriptors.length === 0) return;

        const descriptorMap = {};
        descriptors.forEach(function(descriptor) {
            descriptorMap[descriptor.key] = descriptor;
        });

        const questionDescriptor = descriptorMap.question || null;
        const correctDescriptor = descriptorMap.correct || null;
        const wrongDescriptor = descriptorMap.wrong || null;

        const questionSequence = questionDescriptor
            ? getCachedFormulaSequence(questionDescriptor.formulaText, mode)
            : [];
        const correctSequence = correctDescriptor
            ? getCachedFormulaSequence(correctDescriptor.formulaText, mode)
            : [];

        const correctStepsForBadge = Array.isArray(context.correctFormulaSteps)
            ? context.correctFormulaSteps
            : [];

        const wrongStepsForBadge = Array.isArray(context.wrongFormulaSteps)
            ? context.wrongFormulaSteps
            : [];

        const frag = document.createDocumentFragment();
        if (questionDescriptor && shouldRenderImages) {
            renderImageFileSection(frag, questionDescriptor, mode, {
                allowImages: shouldRenderImages,
                referenceSequence: null,
                highlightKind: '',
                badgeText: '',
                legendText: ''
            });
        }
        if (correctDescriptor) {
            renderImageFileSection(frag, correctDescriptor, mode, {
                allowImages: shouldRenderImages,
                referenceSequence: questionSequence,
                highlightKind: '',
                badgeText: '',
                legendText: ''
            });
        }
        if (wrongDescriptor) {
            renderImageFileSection(frag, wrongDescriptor, mode, {
                allowImages: shouldRenderImages,
                referenceSequence: correctSequence,
                highlightKind: '',
                badgeText: '',
                legendText: ''
            });
        }

        wrongActionImagesEl.appendChild(frag);
        wrongActionImagesEl.hidden = wrongActionImagesEl.childElementCount === 0;
    }

    /**
     * Sincronizza disponibilita toggle immagini con la modalita linguaggio parlato.
     * @pre showWrongActionImagesInput puo essere nullo nelle pagine senza controllo.
     * @post Il controllo e abilitato/disabilitato e lo stato interno resta coerente.
     */
    function syncWrongImagesAvailability() {
        if (!showWrongActionImagesInput) return;
        const enabled = Boolean(state.spokenlanguage);
        showWrongActionImagesInput.disabled = !enabled;
        if (!enabled) {
            showWrongActionImagesInput.checked = false;
            state.showWrongActionImages = false;
            clearWrongActionImages();
            return;
        }
        state.showWrongActionImages = Boolean(showWrongActionImagesInput.checked);
    }

    function syncSpokenLanguageAvailability() {
        if (!spokenLanguageInput) return;
        spokenLanguageInput.disabled = Boolean(state.spokenlanguageLocked);
    }

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Estrae una mappa atomo->boolean dalle righe informative della domanda.
     * @pre infoLines e array di stringhe o valore non-array.
     * @post Restituisce una mappa con chiavi originali e lowercase quando trovate.
     */
    function extractTruthAssignments(infoLines) {
        const out = {};
        if (!Array.isArray(infoLines)) return out;
        infoLines.forEach(function(line) {
            const match = String(line).match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s+(?:e|è|=|:)\s*(vero|falso)\s*$/i);
            if (!match) return;
            const atom = match[1];
            const isTrue = match[2].toLowerCase() === 'vero';
            out[atom] = isTrue;
            out[atom.toLowerCase()] = isTrue;
        });
        return out;
    }

    /**
     * Associa ogni atomo a una coppia nome+azione per modalita linguaggio parlato.
     * @pre atoms e un array di identificatori atomici.
     * @post Restituisce una mappa completa atomo -> {nome, azione}.
     */
    function buildAtomSpokenMap(atoms) {
        const shuffledNomi = shuffle(NOMI);
        const shuffledAzioni = shuffle(AZIONI);
        const map = {};
        atoms.forEach(function(atom, i) {
            map[atom] = {
                nome: shuffledNomi[i % shuffledNomi.length],
                azione: shuffledAzioni[i % shuffledAzioni.length]
            };
        });
        return map;
    }

    /**
     * Colleziona l'insieme atomi usati in info/opzioni per la modalita parlata.
     * @pre parsed contiene opzionalmente info e options.
     * @post Restituisce un array ordinato di atomi unici in lowercase.
     */
    function collectAtomsFromExercise(parsed) {
        const atomSet = new Set();
        if (Array.isArray(parsed.info)) {
            parsed.info.forEach(function(line) {
                const match = String(line).match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s+(?:e|è|=|:)\s*(vero|falso)\s*$/i);
                if (match) atomSet.add(match[1].toLowerCase());
            });
        }
        if (Array.isArray(parsed.options)) {
            parsed.options.forEach(function(opt) {
                const formula = getOptionDisplayFormula(opt);
                const quantifiedVars = new Set();
                String(formula).replace(/[∀∃]\s*([A-Za-z][A-Za-z0-9_]*)/g, function(_, variable) {
                    quantifiedVars.add(String(variable).toLowerCase());
                    return _;
                });

                const predicateMatches = String(formula).match(/\b([A-Za-z][A-Za-z0-9_]*)\s*\(\s*[A-Za-z][A-Za-z0-9_]*\s*\)/g);
                if (predicateMatches) {
                    predicateMatches.forEach(function(predicate) {
                        const baseMatch = predicate.match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*\(/);
                        if (baseMatch) atomSet.add(baseMatch[1].toLowerCase());
                    });
                }

                const letters = String(formula).match(/\b[A-Za-z]\b(?!\s*\()/g);
                if (letters) {
                    letters.forEach(function(letter) {
                        const lower = String(letter).toLowerCase();
                        if (!quantifiedVars.has(lower)) {
                            atomSet.add(lower);
                        }
                    });
                }
            });
        }
        return Array.from(atomSet).sort();
    }

    function extractQuantifiedVariables(text) {
        const variables = [];
        const seen = new Set();
        String(text || '').replace(/[∀∃]\s*([A-Za-z][A-Za-z0-9_]*)/g, function(_, variable) {
            const normalized = String(variable || '').toLowerCase();
            if (!seen.has(normalized)) {
                seen.add(normalized);
                variables.push(String(variable || ''));
            }
            return _;
        });
        return variables;
    }

    function normalizeFormulaAtoms(text) {
        let out = String(text || '');
        if (out.indexOf('"') !== -1) {
            return out.replace(/"([^"]*)"/g, function(_, inner) {
                return '"' + normalizeFormulaAtoms(inner) + '"';
            });
        }
        out = out.replace(/^\s*([a-z])\s+((?:e|è|=|:)\s*(?:vero|falso)\s*)$/i, function(_, atom, rest) {
            return atom.toUpperCase() + ' ' + rest;
        });
        out = out.replace(/\b([a-z])(?=\s*\()/g, function(_, atom) {
            return atom.toUpperCase();
        });

        function previousNonSpaceChar(source, index) {
            for (let i = index - 1; i >= 0; i -= 1) {
                const ch = source[i];
                if (!/\s/.test(ch)) return ch;
            }
            return '';
        }

        function nextNonSpaceChar(source, index) {
            for (let i = index; i < source.length; i += 1) {
                const ch = source[i];
                if (!/\s/.test(ch)) return ch;
            }
            return '';
        }

        function isFormulaBoundaryChar(ch) {
            return !ch || /[\(\)\[\]\{\}¬∧∨→↔,:;]/.test(ch);
        }

        const quantifiedVariables = extractQuantifiedVariables(out);
        const quantifiedSet = new Set(quantifiedVariables.map(function(v) {
            return String(v).toLowerCase();
        }));
        const quantifiedVariable = quantifiedVariables.length > 0
            ? String(quantifiedVariables[0] || '').toLowerCase()
            : null;

        if (quantifiedVariables.length > 0) {
            out = out.replace(/([∀∃]\s*)([A-Za-z][A-Za-z0-9_]*)/g, function(_, prefix, variable) {
                return prefix + String(variable || '').toLowerCase();
            });
        }

        if (quantifiedVariable) {
            out = out.replace(/\b([A-Za-z])\b(?!\s*\()/g, function(_, atom, offset, source) {
                const lower = String(atom).toLowerCase();
                if (quantifiedSet.has(lower)) {
                    return lower;
                }
                const prev = previousNonSpaceChar(source, offset);
                const next = nextNonSpaceChar(source, offset + String(atom).length);
                if (!isFormulaBoundaryChar(prev) || !isFormulaBoundaryChar(next)) {
                    return atom;
                }
                return String(atom).toUpperCase() + '(' + quantifiedVariable + ')';
            });
            return out;
        }

        return out.replace(/\b([a-z])\b(?!\s*\()/g, function(_, atom, offset, source) {
            const prev = previousNonSpaceChar(source, offset);
            const next = nextNonSpaceChar(source, offset + String(atom).length);
            if (!isFormulaBoundaryChar(prev) || !isFormulaBoundaryChar(next)) {
                return atom;
            }
            return atom.toUpperCase();
        });
    }

    function normalizeAtomLookupKey(token) {
        const source = String(token || '').trim();
        const predicateMatch = source.match(/^([A-Za-z][A-Za-z0-9_]*)\s*\(\s*[A-Za-z][A-Za-z0-9_]*\s*\)$/);
        if (predicateMatch) {
            return predicateMatch[1].toLowerCase();
        }
        return source.toLowerCase();
    }

    function formatSpokenAction(action, negated) {
        const normalizedAction = String(action || '').trim();
        let actionText = normalizedAction;
        if (normalizedAction === 'apre' || normalizedAction === 'apre la porta' || normalizedAction === 'chiude') {
            actionText = normalizedAction + ' la porta';
            if (normalizedAction === 'apre la porta') {
                actionText = normalizedAction;
            }
        }
        if (negated) {
            return 'non ' + actionText;
        }
        return actionText;
    }

    /**
     * Converte una formula simbolica in testo piu naturale in base alla mappa parlata.
     * @pre text e una stringa formula o testo; atomSpokenMap puo essere vuota.
     * @post Restituisce una stringa leggibile con sostituzioni lessicali e connettivi testuali.
     */
    function applySpokenTransform(text) {
        if (!state.spokenlanguage || Object.keys(atomSpokenMap).length === 0) return String(text || '');
        let out = normalizeFormulaAtoms(text);
        const quantifiedSet = new Set(extractQuantifiedVariables(out).map(function(v) {
            return String(v).toLowerCase();
        }));
        const spokenTokens = [];
        function stashSpoken(textChunk) {
            spokenTokens.push(textChunk);
            return '%%' + String(spokenTokens.length - 1) + '%%';
        }

        out = out.replace(/¬\s*([A-Za-z][A-Za-z0-9_]*(?:\s*\(\s*[A-Za-z][A-Za-z0-9_]*\s*\))?)/g, function(_, atom) {
            const key = normalizeAtomLookupKey(atom);
            const entry = atomSpokenMap[key] || atomSpokenMap[String(key).toLowerCase()];
            if (entry) {
                return stashSpoken(entry.nome + ' ' + formatSpokenAction(entry.azione, true));
            }
            return 'non ' + atom;
        });

        out = out.replace(/\b([A-Za-z][A-Za-z0-9_]*)(?:\s*\(\s*([A-Za-z][A-Za-z0-9_]*)\s*\))?/g, function(match, atom, variable) {
            if (!variable && quantifiedSet.has(String(atom).toLowerCase())) {
                return match;
            }
            const key = normalizeAtomLookupKey(variable ? atom + '(' + variable + ')' : atom);
            const entry = atomSpokenMap[key] || atomSpokenMap[String(key).toLowerCase()];
            if (entry) {
                return stashSpoken(entry.nome + ' ' + formatSpokenAction(entry.azione, false));
            }
            return match;
        });

        out = out
            .replace(/∀\s*[A-Za-z][A-Za-z0-9_]*/g, 'per ogni persona tale che')
            .replace(/∃\s*[A-Za-z][A-Za-z0-9_]*/g, 'esiste una persona tale che')
            .replace(/↔/g, ' se e solo se ')
            .replace(/→/g, ' implica che ')
            .replace(/∧/g, ' e ')
            .replace(/∨/g, ' o ')
            .replace(/¬\s*/g, 'non ');

        out = out.replace(/%%(\d+)%%/g, function(_, idx) {
            const numericIndex = Number(idx);
            return spokenTokens[numericIndex] || '';
        });
        return out.replace(/\s{2,}/g, ' ').trim();
    }

    /**
     * Traduce una singola riga info in linguaggio parlato preservando verita/falsita.
     * @pre line e stringa con possibile pattern "atomo e vero/falso".
     * @post Restituisce una frase naturale basata su atomSpokenMap se disponibile.
     */
    function formatSpokenInfoLine(line) {
        const match = String(line).match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s+(?:e|è|=|:)\s*(vero|falso)\s*$/i);
        if (!match) return applySpokenTransform(String(line));
        const atom = match[1];
        const isTrue = match[2].toLowerCase() === 'vero';
        const key = normalizeAtomLookupKey(atom);
        const entry = atomSpokenMap[key] || atomSpokenMap[String(key).toLowerCase()];
        if (!entry) return line;
        return entry.nome + ' ' + formatSpokenAction(entry.azione, !isTrue);
    }

    /**
     * Colora ed evidenzia token atomici in base alle assegnazioni di verita correnti.
     * @pre text e stringa; currentTruthAssignments contiene eventuali valori noti.
     * @post Restituisce HTML sanitizzato con span semantici quando applicabili.
     */
    function colorizeAtomsInText(text) {
        const source = String(text || '');
        const keys = Object.keys(currentTruthAssignments || {});
        const shouldColor = Boolean(state.colorAtoms && keys.length > 0);
        const shouldHighlight = Boolean(state.highlightAtoms);
        if (!shouldColor && !shouldHighlight) return escapeHtml(source);

        const atomRegex = /\b[A-Za-z][A-Za-z0-9_]*\b/g;
        let out = '';
        let last = 0;
        let match;
        while ((match = atomRegex.exec(source)) !== null) {
            const start = match.index;
            const end = atomRegex.lastIndex;
            const token = match[0];
            out += escapeHtml(source.slice(last, start));

            let hasValue = false;
            let value = false;
            let isAtom = false;
            if (Object.prototype.hasOwnProperty.call(currentTruthAssignments, token)) {
                hasValue = true;
                value = Boolean(currentTruthAssignments[token]);
                isAtom = true;
            } else if (Object.prototype.hasOwnProperty.call(currentTruthAssignments, token.toLowerCase())) {
                hasValue = true;
                value = Boolean(currentTruthAssignments[token.toLowerCase()]);
                isAtom = true;
            } else if (token.toLowerCase() === 'vero') {
                hasValue = true;
                value = true;
            } else if (token.toLowerCase() === 'falso') {
                hasValue = true;
                value = false;
            } else if (/^[A-Za-z]$/.test(token)) {
                isAtom = true;
            }

            const classes = [];
            if (shouldColor && hasValue) {
                classes.push(value ? 'quiz-atom-true' : 'quiz-atom-false');
            }
            if (shouldHighlight && isAtom) {
                classes.push('quiz-atom-emphasis');
            }

            if (classes.length > 0) {
                out += '<span class="' + classes.join(' ') + '">' + escapeHtml(token) + '</span>';
            } else {
                out += escapeHtml(token);
            }
            last = end;
        }
        out += escapeHtml(source.slice(last));
        return out;
    }

    /**
     * Applica trasformazioni di presentazione formula in base alle opzioni attive.
     * @pre text e stringa formula o testo.
     * @post Restituisce testo trasformato (parentesi differenziate e/o parlato).
     */
    function applyFormulaTransforms(text) {
        let out = normalizeFormulaAtoms(text);
        if (state.differentiateParens) {
            out = differentiateParentheses(out);
        }
        if (state.spokenlanguage) {
            out = applySpokenTransform(out);
        }
        return out;
    }

    /**
     * Rirenderizza domanda/info/opzioni dopo variazione impostazioni visuali.
     * @pre Lo stato domanda corrente e inizializzato.
     * @post UI allineata a state (colori atomi, parlato, parentesi).
     */
    function refreshCurrentExerciseRendering() {
        if (questionEl && currentQuestionText) {
            questionEl.textContent = state.exerciseKind === 'translation'
                ? currentQuestionText
                : getCachedFormulaTransforms(currentQuestionText);
            // Only sync width when rendering after question load (called in loadExercise),
            // not on every setting change to reduce DOM reflows
        }
        showInfo(currentQuestionInfo);
        renderOptions();
    }

    /**
     * Attiva/disattiva il layout split con pannello formule laterale.
     * @pre Gli elementi layout opzionali possono essere assenti; la funzione deve restare safe.
     * @post Le classi/visibilita layout risultano allineate allo stato corrente.
     */
    function applyFormulasLayout() {
        const enabled = Boolean(state.showFormulas && splitLayoutEl && formulasPaneEl && testEl && !testEl.hidden);
        if (splitLayoutEl) {
            splitLayoutEl.classList.toggle('with-formulas', enabled);
        }
        if (formulasPaneEl) {
            formulasPaneEl.hidden = !enabled;
        }
        document.body.classList.toggle('quiz-formulas-mode', enabled);
    }

    function updateTestTitle() {
        if (!testTitleEl) return;
        testTitleEl.textContent = 'Esercizio nº' + String(currentExercise);
    }

    /**
     * Calcola quante domande di negazione quantificatori inserire nel test.
     * @pre totalQuestions e numero totale domande del test.
     * @post Restituisce un intero >= 0 conforme alla strategia di distribuzione.
     */
    function pickQuantifierNegationTarget(totalQuestions) {
        if (!Number.isFinite(totalQuestions) || totalQuestions < 1) return 0;
        if (totalQuestions < 5) {
            return Math.random() < 0.5 ? 1 : 0;
        }
        if (totalQuestions < 10) {
            return 1;
        }
        return Math.max(1, Math.round(totalQuestions * 0.1));
    }

    function formatTimer(totalSeconds) {
        const safe = Math.max(0, Number(totalSeconds) || 0);
        const mm = Math.floor(safe / 60);
        const ss = safe % 60;
        const mText = mm < 10 ? '0' + String(mm) : String(mm);
        const sText = ss < 10 ? '0' + String(ss) : String(ss);
        return mText + ':' + sText;
    }

    function renderTimer() {
        if (!timerDisplayEl) return;
        timerDisplayEl.textContent = formatTimer(timerSecondsRemaining);
    }

    function stopTimer() {
        if (timerIntervalId !== null) {
            clearInterval(timerIntervalId);
            timerIntervalId = null;
        }
    }

    /**
     * Avvia il timer del test con countdown in secondi.
     * @pre minutes e convertibile in intero positivo oppure fallback.
     * @post Il timer e visibile e decrementa ogni secondo fino a scadenza o stop esplicito.
     */
    function startTimer(minutes) {
        stopTimer();
        timerSecondsRemaining = parsePositiveInt(minutes, DEFAULT_TIME_MINUTES) * 60;
        renderTimer();
        if (timerDisplayEl) timerDisplayEl.hidden = false;

        timerIntervalId = setInterval(function() {
            timerSecondsRemaining -= 1;
            if (timerSecondsRemaining <= 0) {
                timerSecondsRemaining = 0;
                renderTimer();
                stopTimer();
                if (state.mode === 'check' || state.mode === 'next') {
                    setStatus('Tempo scaduto.');
                    showCompletion();
                }
                return;
            }
            renderTimer();
        }, 1000);
    }

    function shouldKeepRawFormula(formula) {
        const text = String(formula || '');
        return /[∀∃]/.test(text);
    }

    /**
     * Sceglie come visualizzare una formula (raw o convertita da Prolog).
     * @pre formula e stringa formula o valore convertibile.
     * @post Restituisce una stringa pronta per l'interfaccia utente.
     */
    function displayFormulaText(formula) {
        if (shouldKeepRawFormula(formula)) {
            return normalizeFormulaAtoms(String(formula || ''));
        }
        return normalizeFormulaAtoms(prologToLogical(formula));
    }

    /**
     * Renderizza il blocco "Sapendo che" della domanda corrente.
     * @pre items e array di stringhe o valore non-array.
     * @post Il pannello info viene popolato o nascosto coerentemente.
     */
    function showInfo(items) {
        if (!Array.isArray(items) || items.length === 0) {
            infoEl.hidden = true;
            infoEl.innerHTML = '';
            return;
        }

        const htmlItems = items.map(function(item) {
            if (state.spokenlanguage) {
                return '<li>' + escapeHtml(formatSpokenInfoLine(item)) + '</li>';
            }
            if (state.exerciseKind === 'translation') {
                return '<li>' + colorizeAtomsInText(String(item)) + '</li>';
            }
            return '<li>' + colorizeAtomsInText(getCachedFormulaTransforms(item)) + '</li>';
        }).join('');
        infoEl.innerHTML = '<p>Sapendo che:</p><ul>' + htmlItems + '</ul>';
        infoEl.hidden = false;
    }

    function formatTruthInfo(entry) {
        if (typeof entry !== 'string') return '';
        const parts = entry.split('-');
        if (parts.length !== 2) return entry;
        const name = parts[0];
        const value = parts[1] === 'true' ? 'vero' : 'falso';
        return name + ' è ' + value;
    }

    function optionTextFromEntry(entry) {
        if (typeof entry === 'string') return String(entry || '').trim();
        if (!entry || typeof entry !== 'object') return '';
        return String(entry.formula_prolog || entry.formula || entry.text || '').trim();
    }

    function optionBooleanFlag(entry, keys) {
        if (!entry || typeof entry !== 'object' || !Array.isArray(keys)) return null;
        for (let i = 0; i < keys.length; i += 1) {
            const key = keys[i];
            if (!Object.prototype.hasOwnProperty.call(entry, key)) continue;
            const value = entry[key];
            if (typeof value === 'boolean') return value;
            if (value === 1 || value === '1' || value === 'true') return true;
            if (value === 0 || value === '0' || value === 'false') return false;
        }
        return null;
    }

    function extractOptionsArray(res) {
        if (!res || typeof res !== 'object') return [];
        if (Array.isArray(res.options)) return res.options;
        if (Array.isArray(res.options_prolog)) return res.options_prolog;
        return [];
    }

    function pickGeneratorResult(payload, nestedKey) {
        if (!payload || typeof payload !== 'object') return payload;
        if (payload.result && typeof payload.result === 'object') {
            return payload.result;
        }
        if (nestedKey && payload[nestedKey] && typeof payload[nestedKey] === 'object') {
            return payload[nestedKey];
        }
        return payload;
    }

    // Normalizza il payload equivalenza in un formato uniforme per il renderer quiz.
    function normalizeEquivalenceResult(payload) {
        const res = pickGeneratorResult(payload, 'build_ex_depth');
        const optionsFromPayload = extractOptionsArray(res);
        const question =
            (res && res.question_prolog) ||
            (res && res.original_formula && res.original_formula.formula_prolog) ||
            '';
        const normalizedOptionsFromArray = optionsFromPayload.map(function(entry) {
            return {
                text: optionTextFromEntry(entry),
                correct: optionBooleanFlag(entry, ['is_correct', 'correct']) === true,
                formulaSteps: normalizeGenerationSteps(entry && entry.generation_steps)
            };
        }).filter(function(entry) {
            return Boolean(entry.text);
        });

        const questionStepsRaw =
            (res && res.original_formula && res.original_formula.generation_steps) ||
            [];
        let options = [];
        if (normalizedOptionsFromArray.length >= 2 && normalizedOptionsFromArray.some(function(entry) { return entry.correct; })) {
            options = normalizedOptionsFromArray;
        } else {
            const correct =
                (res && res.correct_answer_prolog) ||
                (res && res.modified_formula && res.modified_formula.formula_prolog) ||
                '';
            const wrongs =
                (res && Array.isArray(res.wrong_answers_prolog) && res.wrong_answers_prolog) ||
                [];
            const filteredWrongs = Array.from(new Set(wrongs)).filter(function(formula) {
                return formula && formula !== correct;
            });
            if (!question || !correct || filteredWrongs.length < 1) {
                return null;
            }
            const correctStepsRaw =
                (res && res.correct_answer_generation_steps) ||
                (res && res.modified_formula && res.modified_formula.generation_steps) ||
                [];
            const wrongStepsMapRaw = extractWrongStepsMap(res, filteredWrongs);
            options = [
                { text: correct, correct: true, formulaSteps: normalizeGenerationSteps(correctStepsRaw) }
            ].concat(filteredWrongs.map(function(wrongFormula) {
                return {
                    text: wrongFormula,
                    correct: false,
                    formulaSteps: normalizeGenerationSteps(wrongStepsMapRaw[wrongFormula])
                };
            }));
        }

        if (!question || options.length < 2 || !options.some(function(entry) { return entry.correct; })) {
            return null;
        }

        const correctOption = options.find(function(entry) { return entry.correct; });

        const imageFormulaSteps = {
            question: normalizeGenerationSteps(questionStepsRaw),
            correct: normalizeGenerationSteps(correctOption && correctOption.formulaSteps),
            wrongByFormula: {}
        };

        if (imageFormulaSteps.question.length === 0) {
            imageFormulaSteps.question = [question];
        }
        if (imageFormulaSteps.correct.length === 0 && correctOption) {
            imageFormulaSteps.correct = [correctOption.text];
        }
        options.forEach(function(option) {
            if (!option || option.correct) return;
            const steps = Array.isArray(option.formulaSteps) ? option.formulaSteps.slice() : [];
            imageFormulaSteps.wrongByFormula[option.text] = steps.length > 0 ? steps : [option.text];
        });

        return {
            kind: 'equivalence',
            question: 'Quale formula è equivalente a "' + prologToLogical(question) + '":',
            info: [],
            options: shuffle(options),
            imageFormulaSteps: imageFormulaSteps
        };
    }

    /**
     * Normalizza il payload backend per esercizi sul valore di verita.
     * @pre payload segue il contratto API truth-value (result/options/information/count).
     * @post Restituisce oggetto quiz standard o null se il payload e invalido.
     */
    function normalizeTruthValueResult(payload) {
        const res = pickGeneratorResult(payload, 'build_tvq');
        const options = extractOptionsArray(res);
        const info = (res && Array.isArray(res.information) && res.information) || [];

        if (options.length !== 4 || info.length < 4 || info.length > 5) {
            return null;
        }

        const parsedOptions = options.map(function(option) {
            return {
                text: optionTextFromEntry(option),
                isTrue: optionBooleanFlag(option, ['is_true', 'truth_value'])
            };
        });

        if (parsedOptions.some(function(option) {
            return !option.text || typeof option.isTrue !== 'boolean';
        })) {
            return null;
        }

        const trueCount = parsedOptions.filter(function(option) { return option.isTrue; }).length;
        const falseCount = parsedOptions.length - trueCount;

        let targetTruthValue = null;
        let question = '';
        if (trueCount === 1 && falseCount === 3) {
            targetTruthValue = true;
            question = 'Quale formula è vera tra le seguenti?';
        } else if (trueCount === 3 && falseCount === 1) {
            targetTruthValue = false;
            question = 'Quale formula è falsa tra le seguenti?';
        } else {
            return null;
        }

        const normalizedOptions = shuffle(parsedOptions.map(function(option) {
            return {
                text: option.text,
                correct: option.isTrue === targetTruthValue
            };
        }));

        return {
            kind: 'truth-value',
            question: question,
            info: info.map(formatTruthInfo),
            options: normalizedOptions
        };
    }

    /**
     * Normalizza il payload backend per esercizi di conseguenza logica.
     * @pre payload segue il contratto API logical-consequence (question/options).
     * @post Restituisce oggetto quiz standard o null se il payload e invalido.
     */
    function normalizeLogicalConsequenceResult(payload) {
        const res = pickGeneratorResult(payload, 'build_logical_consequence_question');
        if (!res || typeof res !== 'object') return null;

        const question = String(res.question_prolog || '').trim();
        let allOptions = extractOptionsArray(res);
        const correctOptions = Array.isArray(res.correct_options) ? res.correct_options : [];
        const wrongOptions = Array.isArray(res.wrong_options) ? res.wrong_options : [];

        // Fallback: some payloads may omit `options` and provide split arrays only.
        if (!allOptions.length && (correctOptions.length || wrongOptions.length)) {
            allOptions = correctOptions.concat(wrongOptions);
        }

        const correctFormulaSet = new Set(correctOptions.map(function(entry) {
            return optionTextFromEntry(entry);
        }).filter(Boolean));

        const normalizedOptions = allOptions.map(function(optionFormula) {
            const text = optionTextFromEntry(optionFormula);
            const explicitFlag = optionBooleanFlag(optionFormula, ['is_correct', 'correct', 'is_consequence', 'consequence']);
            const inferredCorrect = correctFormulaSet.has(text);
            return {
                text: text,
                correct: explicitFlag === true || inferredCorrect
            };
        }).filter(function(option) {
            return Boolean(option.text);
        });

        if (!question || normalizedOptions.length < 2 || !normalizedOptions.some(function(option) { return option.correct; })) {
            return null;
        }

        return {
            kind: 'logical-consequence',
            question: 'Quale formula è conseguenza logica di "' + prologToLogical(question) + '":',
            info: [],
            options: shuffle(normalizedOptions)
        };
    }

    /**
     * Genera opzioni multiple-choice per negazione di formule quantificate.
     * @pre quantifier e '∀' o '∃'; baseFormula e una formula testuale.
     * @post Restituisce domanda e 3 opzioni con esattamente una risposta corretta.
     */
    function buildQuantifiedNegationOptions(quantifier, baseFormula) {
        const normalizedFormula = String(baseFormula || '').trim() || 'p';
        const wrappedFormula = '(' + normalizedFormula + ')';
        const isUniversal = quantifier === '∀';
        const original = quantifier + 'x ' + wrappedFormula;
        const correct = isUniversal
            ? '∃x ¬' + wrappedFormula
            : '∀x ¬' + wrappedFormula;

        const wrongs = isUniversal
            ? [
                '∀x ¬' + wrappedFormula,
                '∃x ' + wrappedFormula
            ]
            : [
                '∃x ¬' + wrappedFormula,
                '∀x ' + wrappedFormula
            ];

        return {
            question: 'Qual\'è la negazione di "' + original + '"?',
            options: shuffle([
                { text: correct, correct: true },
                { text: wrongs[0], correct: false },
                { text: wrongs[1], correct: false }
            ])
        };
    }

    function normalizeTranslationResult(payload) {
        const res = pickGeneratorResult(payload, 'build_translation_question');
        if (!res || typeof res !== 'object') return null;

        const question = String(res.question_text || res.question || '').trim();
        const info = Array.isArray(res.info) ? res.info.map(function(entry) {
            return String(entry || '').trim();
        }).filter(Boolean) : [];
        const allOptions = extractOptionsArray(res);
        const normalizedOptions = allOptions.map(function(optionFormula) {
            return {
                text: optionTextFromEntry(optionFormula),
                correct: optionBooleanFlag(optionFormula, ['is_correct', 'correct']) === true
            };
        }).filter(function(option) {
            return Boolean(option.text);
        });

        if (!question || normalizedOptions.length < 2 || !normalizedOptions.some(function(option) { return option.correct; })) {
            return null;
        }

        return {
            kind: 'translation',
            question: question,
            info: info,
            options: shuffle(normalizedOptions)
        };
    }

    /**
     * Renderizza i bottoni opzione per la domanda corrente.
     * @pre state.options contiene il set opzioni corrente.
     * @post optionsEl contiene i bottoni aggiornati e lo stato selezione e sincronizzato.
     */
    function renderOptions() {
        optionsEl.innerHTML = '';

        state.options.forEach(function(opt, index) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'quiz-option';
            button.setAttribute('role', 'radio');
            button.setAttribute('aria-checked', index === state.selectedIndex ? 'true' : 'false');
            button.dataset.index = String(index);
            button.innerHTML = colorizeAtomsInText(getCachedFormulaTransforms(getOptionDisplayFormula(opt)));
            optionsEl.appendChild(button);
        });

        updateSelectionVisual();
    }

    function updateSelectionVisual() {
        const items = optionsEl.querySelectorAll('.quiz-option');
        items.forEach(function(item, idx) {
            item.classList.toggle('is-selected', idx === state.selectedIndex);
            item.setAttribute('aria-checked', idx === state.selectedIndex ? 'true' : 'false');
        });
    }

    function setStatus(msg) {
        statusEl.textContent = msg || '';
    }

    function resetVisualFeedback() {
        const items = optionsEl.querySelectorAll('.quiz-option');
        items.forEach(function(item) {
            item.classList.remove('is-correct');
            item.classList.remove('is-correct-answer');
            item.classList.remove('is-wrong');
            item.classList.remove('is-final');
        });
    }

    /**
     * Recupera un esercizio di equivalenza dal backend.
     * @pre equivalenceApiUrl raggiungibile e backend conforme al contratto atteso.
     * @post Restituisce un oggetto normalizzato pronto per il rendering o solleva errore.
     */
    async function fetchEquivalenceExercise() {
        const response = await fetch(equivalenceApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                use_all: false,
                wrong_answers_count: 3,
                timeout: 10
            })
        });

        try {
            const payload = await response.json();
            const parsed = normalizeEquivalenceResult(payload);
            if (parsed) {
                return parsed;
            }
        } catch (_) {
            // The backend returned non-JSON or an unexpected payload.
        }

        throw new Error('HTTP ' + response.status);
    }

    /**
     * Recupera un esercizio sul valore di verita.
     * @pre truthApiUrl raggiungibile e backend conforme al contratto atteso.
     * @post Restituisce un oggetto normalizzato con domanda, info e 4 opzioni.
     */
    async function fetchTruthValueExercise() {
        const predicateCount = 4 + Math.floor(Math.random() * 2);
        const response = await fetch(truthApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                predicate_count: predicateCount,
                true_options_count: 1,
                false_options_count: 3,
                timeout: 10
            })
        });
        
        try {
            const payload = await response.json();
            const parsed = normalizeTruthValueResult(payload);
            if (parsed) {
                return parsed;
            }
        } catch (_) {
            // The backend returned non-JSON or an unexpected payload.
        }
        throw new Error('HTTP ' + response.status);
    }

    /**
     * Recupera un esercizio di conseguenza logica dal backend.
     * @pre logicalConsequenceApiUrl raggiungibile e backend conforme al contratto atteso.
     * @post Restituisce un oggetto normalizzato con domanda e opzioni.
     */
    async function fetchLogicalConsequenceExercise() {
        let lastStatus = 0;
        let lastDetail = '';

        for (let attempt = 0; attempt < 4; attempt += 1) {
            const variableCount = attempt % 2 === 0 ? 3 : 4;
            const response = await fetch(logicalConsequenceApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    variable_count: variableCount,
                    correct_options_count: 1,
                    wrong_options_count: 3,
                    timeout: 10
                })
            });

            lastStatus = response.status;

            let payload = null;
            try {
                payload = await response.json();
            } catch (_) {
                payload = null;
            }

            const parsed = normalizeLogicalConsequenceResult(payload);
            if (parsed) {
                return parsed;
            }

            const detailText = payload && typeof payload === 'object' ? String(payload.detail || '') : '';
            if (detailText) {
                lastDetail = detailText;
            }
        }

        if (lastDetail) {
            throw new Error('HTTP ' + lastStatus + ' - ' + lastDetail);
        }
        throw new Error('HTTP ' + lastStatus);
    }

    async function fetchQuantifierNegationExercise() {
        const variableCount = 3 + Math.floor(Math.random() * 2);
        const response = await fetch(formulaByVariableCountApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                variable_count: variableCount,
                use_all: false,
                timeout: 10
            })
        });
        
        try {
            const payload = await response.json();
            const baseFormula = String((payload && payload.result) || '').trim();
            if (baseFormula) {
                const logicalBaseFormula = prologToLogical(baseFormula);
                const quantifier = Math.random() < 0.5 ? '∀' : '∃';
                const quantified = buildQuantifiedNegationOptions(quantifier, logicalBaseFormula);
                return {
                    kind: 'quantifier-negation',
                    question: quantified.question,
                    info: [],
                    options: quantified.options
                };
            }
        } catch (_) {
            // The backend returned non-JSON or an unexpected payload.
        }
        throw new Error('HTTP ' + response.status);
    }

    async function fetchTranslationExercise() {
        const response = await fetch(translationApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mode: 'auto',
                quantifier_ratio: 0.5,
                wrong_options_count: 3,
                names_pool: NOMI,
                actions_pool: AZIONI,
                implied_person_predicate: false,
                allow_spoken_mode: false,
                timeout_seconds: 10
            })
        });
        
        try {
            const payload = await response.json();
            const parsed = normalizeTranslationResult(payload);
            if (parsed) {
                return parsed;
            }
        } catch (_) {
            // The backend returned non-JSON or an unexpected payload.
        }
        throw new Error('HTTP ' + response.status);
    }

    /**
     * Carica la prossima domanda scegliendo il tipo di esercizio in base al piano corrente.
     * @pre Il quiz e in stato attivo (test avviato) e i nodi UI essenziali sono disponibili.
     * @post Aggiorna domanda/opzioni/stato; in caso errore mostra fallback utente senza interrompere l'app.
     */
    async function loadExercise() {
        state.locked = false;
        state.mode = 'check';
        state.selectedIndex = null;
        actionButton.textContent = 'Controlla';
        setStatus('Caricamento...');
        optionsEl.innerHTML = '';
        showInfo([]);

        try {
            const standardLoaders = [
                fetchEquivalenceExercise,
                fetchTruthValueExercise,
                fetchLogicalConsequenceExercise
            ];
            const availableLoaders = state.spokenlanguage
                ? standardLoaders.slice()
                : standardLoaders.concat([fetchTranslationExercise]);
            const pendingQuantifierNegation = Math.max(0, quantifierNegationTarget - quantifierNegationUsed);
            const questionsLeftIncludingCurrent = Math.max(0, totalExercises - currentExercise + 1);
            const mustUseQuantifierNegation = pendingQuantifierNegation > 0 && questionsLeftIncludingCurrent <= pendingQuantifierNegation;

            let loader = null;
            if (mustUseQuantifierNegation) {
                loader = fetchQuantifierNegationExercise;
            } else if (pendingQuantifierNegation > 0) {
                loader = pickRandom(availableLoaders.concat([fetchQuantifierNegationExercise]));
            } else {
                loader = pickRandom(availableLoaders);
            }

            const parsed = await loader();
            if (!parsed) {
                throw new Error('Formato risposta non valido');
            }

            state.exerciseKind = parsed.kind;
            state.options = parsed.options;
            state.correctIndex = parsed.options.findIndex(function(option) {
                return option.correct;
            });
            state.selectedIndex = 0;

            if (parsed.kind === 'quantifier-negation') {
                quantifierNegationUsed += 1;
            }

            if (state.correctIndex < 0) {
                throw new Error('Risposta corretta non trovata');
            }

            currentQuestionText = parsed.question;
            currentImageFormulaSteps = parsed.imageFormulaSteps || { question: [], correct: [], wrongByFormula: {} };
            // Clear formula sequence cache when loading new question to avoid stale data
            clearFormulaSequenceCaches();
            if (state.spokenlanguage) {
                atomSpokenMap = buildAtomSpokenMap(collectAtomsFromExercise(parsed));
                buildSpokenNameColorMap();
            } else {
                atomSpokenMap = {};
                resetSpokenNameColors();
            }
            questionEl.textContent = parsed.kind === 'translation'
                ? parsed.question
                : applyFormulaTransforms(parsed.question);
            syncWrongImagesWidth();
            currentQuestionInfo = Array.isArray(parsed.info) ? parsed.info.slice() : [];
            currentTruthAssignments = extractTruthAssignments(currentQuestionInfo);
            showInfo(parsed.info);
            renderOptions();
            clearWrongActionImages();
            setStatus('Usa il mouse o le frecce per selezionare.');
            optionsEl.focus();
            
            // Registra il timestamp di quando l'utente vede la domanda
            if (currentExercise > 0 && currentExercise <= totalExercises) {
                questionViewTimestamps[currentExercise] = Date.now();
            }
        } catch (err) {
            setStatus('Errore nel caricamento esercizio: ' + err.message);
            questionEl.textContent = 'Impossibile caricare l\'esercizio.';
            currentQuestionText = '';
            atomSpokenMap = {};
            resetSpokenNameColors();
            currentQuestionInfo = [];
            currentTruthAssignments = {};
            currentImageFormulaSteps = { question: [], correct: [], wrongByFormula: {} };
            showInfo([]);
            clearWrongActionImages();
        }
    }

    /**
     * Sposta la selezione corrente nelle opzioni con comportamento circolare.
     * @pre delta e intero (tipicamente +/-1).
     * @post state.selectedIndex cambia se il quiz non e bloccato.
     */
    function moveSelection(delta) {
        if (state.locked || state.options.length === 0) return;

        const len = state.options.length;
        state.selectedIndex = (state.selectedIndex + delta + len) % len;
        updateSelectionVisual();
    }

    /**
     * Seleziona direttamente un indice opzione.
     * @pre idx e compreso tra 0 e state.options.length-1.
     * @post La selezione visiva viene aggiornata se il quiz non e bloccato.
     */
    function selectIndex(idx) {
        if (state.locked || idx < 0 || idx >= state.options.length) return;

        state.selectedIndex = idx;
        updateSelectionVisual();
    }

    /**
     * Valuta la risposta selezionata e prepara il passaggio alla domanda successiva.
        * @pre state.options contiene almeno 2 opzioni e state.correctIndex e valido.
     * @post Blocca la domanda corrente, aggiorna feedback visuale/testuale e registra il risultato nel recap.
     */
    // Format elapsed time in seconds with two decimals and 's' suffix, or '' if invalid
    function formatElapsedTime(ms) {
        if (typeof ms !== 'number' || isNaN(ms) || ms < 0) return '';
        return (ms / 1000).toFixed(2) + 's';
    }

    function checkAnswer() {
        if (!Array.isArray(state.options) || state.options.length < 2) {
            setStatus('Nessun esercizio disponibile.');
            return;
        }

        if (state.locked) return;
        state.locked = true;

        try {
            resetVisualFeedback();

            const selected = optionsEl.querySelector('.quiz-option.is-selected');
            if (!selected || state.selectedIndex == null) {
                console.warn("Nessuna selezione valida");
                return;
            }

            const isCorrect = state.selectedIndex === state.correctIndex;

            selected.classList.add('is-final');
            selected.classList.add(isCorrect ? 'is-correct' : 'is-wrong');

            if (!isCorrect) {
                const options = optionsEl.querySelectorAll('.quiz-option');
                const correctOption = options[state.correctIndex];
                if (correctOption) {
                    correctOption.classList.add('is-final');
                    correctOption.classList.add('is-correct-answer');
                }
                renderWrongActionImages(false);
            } else {
                clearWrongActionImages();
            }

            // Accesso sicuro alle opzioni
            const selectedRaw = state.options[state.selectedIndex] ?? '';
            const correctRaw = state.options[state.correctIndex] ?? '';

            const selectedFormula = getOptionDisplayFormula(selectedRaw);
            const correctFormula = getOptionDisplayFormula(correctRaw);

            // CALCOLA IL TEMPO DI RISPOSTA UNA VOLTA SOLA
            let tempoRisposta = '';
            if (questionViewTimestamps[currentExercise] != null) {
                const elapsed = Date.now() - questionViewTimestamps[currentExercise];
                tempoRisposta = formatElapsedTime(elapsed);
            }

            // Tipo domanda calcolato dal kind interno per evitare ambiguita nel testo domanda.
            let tipoDomanda = '';
            switch (state.exerciseKind) {
                case 'truth-value':
                    tipoDomanda = 'Ipotesi';
                    break;
                case 'equivalence':
                    tipoDomanda = 'Equivalenza';
                    break;
                case 'logical-consequence':
                    tipoDomanda = 'Conseguenza logica';
                    break;
                case 'translation':
                    tipoDomanda = 'Traduzione';
                    break;
                default:
                    tipoDomanda = 'Negazione';
                    break;
            }
            const qText = questionEl.textContent || '';

            // Opzioni attive (usa funzione sicura)
            const opzioniAttive = getActiveOptions();

            // Risposte mostrate (versione robusta)
            let risposteMostrate = '';
            if (Array.isArray(state.options)) {
                risposteMostrate = state.options.map(opt => {
                    try {
                        if (!opt) return '';
                        if (typeof opt === 'object' && opt !== null && 'text' in opt) {
                            return String(opt.text ?? '');
                        }
                        return String(opt);
                    } catch {
                        return '';
                    }
                }).join(' | ');
            }

            // Domanda completa
            let domandaCompleta = qText;
            if (tipoDomanda === 'Ipotesi' && currentQuestionInfo && currentQuestionInfo.length > 0) {
                domandaCompleta = qText.replace(/\?$/, '') + ' (' + currentQuestionInfo.join(', ') + ')';
            }

            reviewResults.push({
                number: currentExercise,
                question: domandaCompleta,
                infoLines: state.spokenlanguage
                    ? currentQuestionInfo.map(formatSpokenInfoLine)
                    : currentQuestionInfo.slice(),
                selectedAnswer: state.spokenlanguage ? applySpokenTransform(selectedFormula) : applyFormulaTransforms(selectedFormula),
                correctAnswer: state.spokenlanguage ? applySpokenTransform(correctFormula) : applyFormulaTransforms(correctFormula),
                isCorrect: isCorrect,
                tipoDomanda: tipoDomanda,
                tempoRisposta: tempoRisposta,
                opzioniAttive: opzioniAttive,
                risposteMostrate: risposteMostrate
            });

            setStatus('Usa il mouse o premi invio per continuare');
            actionButton.textContent = currentExercise >= totalExercises ? 'Termina' : 'Prossimo';

        } catch (err) {
            console.error("Errore in checkAnswer:", err);
        }

        // SEMPRE eseguito → evita blocchi
        state.mode = 'next';
    }

    function renderReview() {
        const logSettings = getLogDataSettings();
        if (logSettings.mode === 'none') {
            showReviewPage();
            return;
        }

        if (reviewTitleEl) {
            reviewTitleEl.hidden = false;
            reviewTitleEl.textContent = 'Feedback';
        }
        if (reviewNavEl) reviewNavEl.hidden = true;
        renderFeedbackPage();
    }

    // Passa alla schermata finale e interrompe il timer.
    function showCompletion() {
        state.locked = true;
        stopTimer();
        if (timerDisplayEl) timerDisplayEl.hidden = true;
        if (introTitleEl) introTitleEl.hidden = true;
        state.options = [];
        optionsEl.innerHTML = '';
        showInfo([]);
        renderReview();
        if (testTitleEl) testTitleEl.hidden = true;
        if (reviewTitleEl) reviewTitleEl.hidden = false;
        if (testEl) testEl.hidden = true;
        if (reviewEl) reviewEl.hidden = false;
        state.mode = 'completed';
    }

    // Ripristina stato iniziale del quiz e mostra la schermata intro.
    function showIntro() {
        currentExercise = 0;
        reviewResults.length = 0;
        currentQuestionInfo = [];
        currentTruthAssignments = {};
        atomSpokenMap = {};
        resetSpokenNameColors();
        currentQuestionText = '';
        currentImageFormulaSteps = { question: [], correct: [], wrongByFormula: {} };
        quantifierNegationTarget = 0;
        quantifierNegationUsed = 0;
        feedbackValues = createEmptyFeedbackValues();
        reviewSubmissionState.inFlight = false;
        reviewSubmissionState.sent = false;
        clearWrongActionImages();
        stopTimer();
        timerSecondsRemaining = standardTimeMinutes * 60;
        renderTimer();
        if (timerDisplayEl) timerDisplayEl.hidden = true;
        if (questionCountInput && !questionCountInput.value) questionCountInput.value = String(DEFAULT_EXERCISES);
        if (timeMinutesInput && !timeMinutesInput.value) timeMinutesInput.value = String(DEFAULT_TIME_MINUTES);
        state.showFormulas = Boolean(showFormulasInput && showFormulasInput.checked);
        state.colorAtoms = Boolean(colorAtomsInput && colorAtomsInput.checked);
        state.spokenlanguage = Boolean(spokenLanguageInput && spokenLanguageInput.checked);
        state.showWrongActionImages = Boolean(showWrongActionImagesInput && showWrongActionImagesInput.checked);
        state.spokenlanguageLocked = false;
        syncSpokenLanguageAvailability();
        syncWrongImagesAvailability();
        applyFormulasLayout();
        if (testTitleEl) testTitleEl.hidden = true;
        if (introTitleEl) introTitleEl.hidden = false;
        if (reviewTitleEl) reviewTitleEl.hidden = true;
        if (reviewTitleEl) reviewTitleEl.textContent = 'Revisione Test';
        if (reviewEl) reviewEl.hidden = true;
        if (reviewNavEl) reviewNavEl.hidden = true;
        if (testEl) testEl.hidden = true;
        if (introEl) introEl.hidden = false;
    }

    /**
     * Avvia un nuovo test con i parametri impostati dall'utente.
     * @pre Gli input intro (numero domande e minuti) sono presenti o fallback gestibili.
     * @post Timer avviato, stato azzerato e prima domanda in caricamento.
     */
    function startTest() {
        currentExercise = 1;
        reviewResults.length = 0;
        totalExercises = parsePositiveInt(questionCountInput && questionCountInput.value, DEFAULT_EXERCISES);
        standardTimeMinutes = parsePositiveInt(timeMinutesInput && timeMinutesInput.value, DEFAULT_TIME_MINUTES);
        quantifierNegationTarget = pickQuantifierNegationTarget(totalExercises);
        quantifierNegationUsed = 0;
        feedbackValues = createEmptyFeedbackValues();
        reviewSubmissionState.inFlight = false;
        reviewSubmissionState.sent = false;
        // Inizializza l'array dei timestamp con la lunghezza corretta (indici da 1 a totalExercises)
        questionViewTimestamps = new Array(totalExercises + 1);
        // Aggiorna il timestamp di inizio esercitazione
        quizStartTimestamp = Date.now();
        if (questionCountInput) questionCountInput.value = String(totalExercises);
        if (timeMinutesInput) timeMinutesInput.value = String(standardTimeMinutes);
        state.showFormulas = Boolean(showFormulasInput && showFormulasInput.checked);
        state.colorAtoms = Boolean(colorAtomsInput && colorAtomsInput.checked);
        state.spokenlanguage = Boolean(spokenLanguageInput && spokenLanguageInput.checked);
        state.showWrongActionImages = Boolean(showWrongActionImagesInput && showWrongActionImagesInput.checked);
        state.spokenlanguageLocked = true;
        syncSpokenLanguageAvailability();
        syncWrongImagesAvailability();
        applyFormulasLayout();
        updateTestTitle();
        if (testTitleEl) testTitleEl.hidden = false;
        if (introTitleEl) introTitleEl.hidden = true;
        if (reviewTitleEl) reviewTitleEl.hidden = true;
        if (introEl) introEl.hidden = true;
        if (reviewEl) reviewEl.hidden = true;
        if (reviewNavEl) reviewNavEl.hidden = true;
        if (testEl) testEl.hidden = false;
        applyFormulasLayout();
        startTimer(standardTimeMinutes);
        loadExercise();
    }

    optionsEl.addEventListener('click', function(evt) {
        const item = evt.target.closest('.quiz-option');
        if (!item) return;
        selectIndex(Number(item.dataset.index));
    });

    optionsEl.addEventListener('keydown', function(evt) {
        if (evt.key === 'ArrowDown' || evt.key === 'ArrowRight') {
            evt.preventDefault();
            moveSelection(1);
            return;
        }

        if (evt.key === 'ArrowUp' || evt.key === 'ArrowLeft') {
            evt.preventDefault();
            moveSelection(-1);
            return;
        }

        if (evt.key === 'Home') {
            evt.preventDefault();
            selectIndex(0);
            return;
        }

        if (evt.key === 'End') {
            evt.preventDefault();
            selectIndex(state.options.length - 1);
            return;
        }

        if (evt.key === 'Enter' || evt.key === ' ') {
            evt.preventDefault();
            actionButton.click();
        }
    });

    actionButton.addEventListener('click', function() {
        if (state.mode === 'check') {
            checkAnswer();
            return;
        }

        if (state.mode === 'next') {
            if (currentExercise >= totalExercises) {
                showCompletion();
                return;
            }
            currentExercise += 1;
            updateTestTitle();
            loadExercise();
        }
    });

    if (reviewRestartButton) {
        reviewRestartButton.addEventListener('click', function() {
            showIntro();
        });
    }

    if (startButton && introEl && testEl) {
        startButton.addEventListener('click', startTest);
        if (showFormulasInput) {
            showFormulasInput.addEventListener('change', function() {
                state.showFormulas = Boolean(showFormulasInput.checked);
                applyFormulasLayout();
            });
        }
        if (colorAtomsInput) {
            colorAtomsInput.addEventListener('change', function() {
                state.colorAtoms = Boolean(colorAtomsInput.checked);
                refreshCurrentExerciseRendering();
            });
        }
        if (spokenLanguageInput) {
            spokenLanguageInput.addEventListener('change', function() {
                if (state.spokenlanguageLocked) {
                    spokenLanguageInput.checked = state.spokenlanguage;
                    return;
                }
                state.spokenlanguage = Boolean(spokenLanguageInput.checked);
                syncWrongImagesAvailability();
                if (state.spokenlanguage && state.options && state.options.length > 0) {
                    atomSpokenMap = buildAtomSpokenMap(collectAtomsFromExercise({
                        info: currentQuestionInfo,
                        options: state.options
                    }));
                    buildSpokenNameColorMap();
                } else {
                    atomSpokenMap = {};
                    resetSpokenNameColors();
                }
                refreshCurrentExerciseRendering();
            });
        }
        if (showWrongActionImagesInput) {
            showWrongActionImagesInput.addEventListener('change', function() {
                state.showWrongActionImages = Boolean(showWrongActionImagesInput.checked);
                if (!state.showWrongActionImages) {
                    clearWrongActionImages();
                }
            });
        }
        window.addEventListener('logicExerciseSettingsChanged', function(evt) {
            if (!isExercisesPage) return;
            const detail = evt && evt.detail ? evt.detail : {};
            state.highlightAtoms = Boolean(detail.highlightAtoms);
            state.differentiateParens = Boolean(detail.differentiateParens);
            refreshCurrentExerciseRendering();
        });

        if (isExercisesPage) {
            state.highlightAtoms = readExerciseSetting(EX_HIGHLIGHT_KEY);
            state.differentiateParens = readExerciseSetting(EX_PARENS_KEY);
        }
        syncWrongImagesAvailability();
        showIntro();
        return;
    }

    currentExercise = 1;
    updateTestTitle();
    if (introTitleEl) introTitleEl.hidden = true;
    if (reviewTitleEl) reviewTitleEl.hidden = true;
    if (reviewNavEl) reviewNavEl.hidden = true;
    loadExercise();
}