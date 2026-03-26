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
         * Restituisce le opzioni attive (testi) mostrate all'utente per la domanda corrente.
         * @returns {string[]} Array dei testi delle opzioni attuali.
         */
        function getActiveOptions() {
            if (state.options && Array.isArray(state.options)) {
                return state.options.map(opt => (typeof opt === 'object' && opt.text ? opt.text : String(opt)));
            }
            return [];
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
    let currentQuestionText = '';
    let currentImageFormulaSteps = { question: [], correct: [], wrongByFormula: {} };
    let quantifierNegationTarget = 0;
    let quantifierNegationUsed = 0;

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

    const variableSets = [
        ['p', 'q', 'r'],
        ['p', 'q', 'r', 's']
    ];

    const NOMI = ['Luca', 'Matteo', 'Alessandro', 'Marco', 'Davide', 'Giulia', 'Sofia', 'Martina', 'Chiara', 'Elisa'];
    const AZIONI = ['nuota', 'corre', 'salta', 'guarda', 'parla', 'apre', 'chiude', 'ascolta'];
    const ACTION_IMAGE_FILES = {
        nuota: { day: 'Nuotare_White.png', night: 'Nuotare_Black.png' },
        corre: { day: 'Correre_White.png', night: 'Correre_Black.png' },
        salta: { day: 'Saltare_White.png', night: 'Saltare_Black.png' },
        guarda: { day: 'Guardare_White.png', night: 'Guardare_Black.png' },
        parla: { day: 'Parlare_White.png', night: 'Parlare_Black.png' },
        apre: { day: 'Aprire_White.png', night: 'Aprire_Black.png' },
        chiude: { day: 'Chiudere_White.png', night: 'Chiudere_Black.png' },
        ascolta: { day: 'Ascoltare_White.png', night: 'Ascoltare_Black.png' }
    };

    const state = {
        mode: 'check',
        selectedIndex: 0,
        options: [],
        correctIndex: -1,
        locked: false,
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

    function isDayMode() {
        return document.documentElement.classList.contains('day-mode') || document.body.classList.contains('day-mode');
    }

    // Pulisce il pannello immagini legato alle risposte errate.
    function clearWrongActionImages() {
        if (!wrongActionImagesEl) return;
        wrongActionImagesEl.innerHTML = '';
        wrongActionImagesEl.hidden = true;
    }

    function resolveImageCandidates(action, mode) {
        const item = ACTION_IMAGE_FILES[action];
        if (!item) return [];
        const raw = item[mode];
        if (Array.isArray(raw)) return raw;
        if (typeof raw === 'string') return [raw];
        return [];
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

    // Trasforma una formula in sequenza di token renderizzabili come immagini/connettivi.
    function buildImageSequenceFromFormula(formula, mode) {
        const tokens = tokenizeFormulaForImages(formula);
        if (tokens.length === 0) return [];

        const sequence = [];

        tokens.forEach(function(token) {
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
        caption.textContent = item.nome + ' ' + item.azione;

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
        return option.text || '';
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
                    const fallbackFormula = wrongs[index] || '';
                    if (fallbackFormula) map[fallbackFormula] = normalizeGenerationSteps(entry);
                    return;
                }
                if (typeof entry === 'string') {
                    const fallbackFormula = wrongs[index] || '';
                    if (fallbackFormula) map[fallbackFormula] = [entry];
                    return;
                }
                const formula = entry.formula_prolog || entry.formula || wrongs[index] || '';
                const steps = normalizeGenerationSteps(entry.generation_steps || entry.steps || entry.path);
                if (formula) map[formula] = steps;
            });
        }

        Object.keys(res).forEach(function(key) {
            if (!/^distraction_\d+$/i.test(key)) return;
            const item = res[key];
            if (!item || typeof item !== 'object') return;
            const formula = item.formula_prolog || item.formula || '';
            const steps = normalizeGenerationSteps(item.generation_steps || item.steps || item.path);
            if (formula) map[formula] = steps;
        });

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
        const sequence = allowImages ? buildImageSequenceFromFormula(descriptor.formulaText, mode) : [];
        if (sequence.length === 0) {
            const empty = document.createElement('span');
            empty.className = 'quiz-wrong-images-empty';
            const fallbackFormula = formatStepFormulaText(descriptor.formulaText);
            empty.textContent = fallbackFormula || 'Nessuna formula disponibile.';
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
            ? buildImageSequenceFromFormula(questionDescriptor.formulaText, mode)
            : [];
        const correctSequence = correctDescriptor
            ? buildImageSequenceFromFormula(correctDescriptor.formulaText, mode)
            : [];

        const fallbackCorrectSteps = [];
        if (context.questionFormulaText) fallbackCorrectSteps.push(context.questionFormulaText);
        if (context.correctFormulaText) fallbackCorrectSteps.push(context.correctFormulaText);
        const correctStepsForBadge = Array.isArray(context.correctFormulaSteps) && context.correctFormulaSteps.length > 0
            ? context.correctFormulaSteps
            : fallbackCorrectSteps;

        const fallbackWrongSteps = [];
        if (context.questionFormulaText) fallbackWrongSteps.push(context.questionFormulaText);
        if (context.wrongFormulaText) fallbackWrongSteps.push(context.wrongFormulaText);
        const wrongStepsForBadge = Array.isArray(context.wrongFormulaSteps) && context.wrongFormulaSteps.length > 0
            ? context.wrongFormulaSteps
            : fallbackWrongSteps;

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
                const letters = formula.match(/\b[a-z]\b/g);
                if (letters) {
                    letters.forEach(function(letter) {
                        atomSet.add(letter);
                    });
                }
            });
        }
        return Array.from(atomSet).sort();
    }

    /**
     * Converte una formula simbolica in testo piu naturale in base alla mappa parlata.
     * @pre text e una stringa formula o testo; atomSpokenMap puo essere vuota.
     * @post Restituisce una stringa leggibile con sostituzioni lessicali e connettivi testuali.
     */
    function applySpokenTransform(text) {
        if (!state.spokenlanguage || Object.keys(atomSpokenMap).length === 0) return String(text || '');
        let out = String(text || '');
        out = out
            .replace(/∀\s*([A-Za-z][A-Za-z0-9_]*)/g, 'per ogni $1')
            .replace(/∃\s*([A-Za-z][A-Za-z0-9_]*)/g, 'esiste $1')
            .replace(/↔/g, ' se e solo se ')
            .replace(/→/g, ' implica ')
            .replace(/∧/g, ' e ')
            .replace(/∨/g, ' o ')
            .replace(/¬\s*([A-Za-z][A-Za-z0-9_]*)/g, '__NEG_ATOM_$1__')
            .replace(/¬\s*/g, 'non ');
        out = out.replace(/\b([A-Za-z][A-Za-z0-9_]*)\b/g, function(match) {
            const entry = atomSpokenMap[match] || atomSpokenMap[match.toLowerCase()];
            if (entry) return entry.nome + ' ' + entry.azione;
            return match;
        });
        out = out.replace(/__NEG_ATOM_([A-Za-z][A-Za-z0-9_]*)__/g, function(_, atom) {
            const entry = atomSpokenMap[atom] || atomSpokenMap[String(atom).toLowerCase()];
            if (entry) return entry.nome + ' non ' + entry.azione;
            return 'non ' + atom;
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
        const entry = atomSpokenMap[atom] || atomSpokenMap[atom.toLowerCase()];
        if (!entry) return line;
        return entry.nome + (isTrue ? ' ' : ' non ') + entry.azione;
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
        let out = String(text || '');
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
            questionEl.textContent = applyFormulaTransforms(currentQuestionText);
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
        if (totalQuestions < 10) {
            return Math.random() < 0.5 ? 1 : 0;
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
        if (shouldKeepRawFormula(formula)) return String(formula || '');
        return prologToLogical(formula);
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
            return '<li>' + colorizeAtomsInText(applyFormulaTransforms(item)) + '</li>';
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

    // Normalizza il payload equivalenza in un formato uniforme per il renderer quiz.
    function normalizeEquivalenceResult(payload) {
        const res = payload && payload.result ? payload.result : payload;
        const question =
            (res && res.question_prolog) ||
            (res && res.original_formula && res.original_formula.formula_prolog) ||
            '';
        const correct =
            (res && res.correct_answer_prolog) ||
            (res && res.modified_formula && res.modified_formula.formula_prolog) ||
            '';
        const wrongs =
            (res && Array.isArray(res.wrong_answers_prolog) && res.wrong_answers_prolog) ||
            [];

        if (!question || !correct || wrongs.length < 3) {
            return null;
        }

        const questionStepsRaw =
            (res && res.original_formula && res.original_formula.generation_steps) ||
            [];
        const correctStepsRaw =
            (res && res.correct_answer_generation_steps) ||
            (res && res.modified_formula && res.modified_formula.generation_steps) ||
            [];
        const wrongStepsMapRaw = extractWrongStepsMap(res, wrongs);

        const options = [
            { text: correct, correct: true, formulaSteps: normalizeGenerationSteps(correctStepsRaw) },
            {
                text: wrongs[0],
                correct: false,
                formulaSteps: normalizeGenerationSteps(wrongStepsMapRaw[wrongs[0]])
            },
            {
                text: wrongs[1],
                correct: false,
                formulaSteps: normalizeGenerationSteps(wrongStepsMapRaw[wrongs[1]])
            },
            {
                text: wrongs[2],
                correct: false,
                formulaSteps: normalizeGenerationSteps(wrongStepsMapRaw[wrongs[2]])
            }
        ];

        const imageFormulaSteps = {
            question: normalizeGenerationSteps(questionStepsRaw),
            correct: normalizeGenerationSteps(correctStepsRaw),
            wrongByFormula: {}
        };

        if (imageFormulaSteps.question.length === 0) {
            imageFormulaSteps.question = [question];
        }
        if (imageFormulaSteps.correct.length === 0) {
            imageFormulaSteps.correct = [correct];
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
        const res = payload && payload.result ? payload.result : payload;
        const options = (res && Array.isArray(res.options) && res.options) || [];
        const info = (res && Array.isArray(res.information) && res.information) || [];
        const trueCount = Number(res && res.true_options_count);
        const falseCount = Number(res && res.false_options_count);

        if (options.length !== 4 || info.length < 2 || info.length > 4) {
            return null;
        }

        let targetTruthValue = null;
        let question = '';
        if (trueCount === 1 && falseCount === 3) {
            targetTruthValue = true;
            question = 'Quale formula è vera tra le false?';
        } else if (trueCount === 3 && falseCount === 1) {
            targetTruthValue = false;
            question = 'Quale formula è falsa tra le giuste?';
        } else {
            return null;
        }

        const normalizedOptions = shuffle(options.map(function(option) {
            return {
                text: option.formula_prolog,
                correct: option.is_true === targetTruthValue
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
     * Genera opzioni multiple-choice per negazione di formule quantificate.
     * @pre quantifier e '∀' o '∃'; baseFormula e una formula testuale.
     * @post Restituisce domanda e 4 opzioni con esattamente una risposta corretta.
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
                '¬∀x ' + wrappedFormula,
                '∃x ' + wrappedFormula
            ]
            : [
                '∃x ¬' + wrappedFormula,
                '¬∃x ' + wrappedFormula,
                '∀x ' + wrappedFormula
            ];

        return {
            question: 'Qual è la negazione di "' + original + '"?',
            options: shuffle([
                { text: correct, correct: true },
                { text: wrongs[0], correct: false },
                { text: wrongs[1], correct: false },
                { text: wrongs[2], correct: false }
            ])
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
            button.innerHTML = colorizeAtomsInText(applyFormulaTransforms(getOptionDisplayFormula(opt)));
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
        const vars = pickRandom(variableSets);
        const response = await fetch(equivalenceApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                variables: vars,
                wrong_answers_count: 3
            })
        });
        if (!response.ok) {
            throw new Error('HTTP ' + response.status);
        }
        const payload = await response.json();
        return normalizeEquivalenceResult(payload);
    }

    /**
     * Recupera un esercizio sul valore di verita.
     * @pre truthApiUrl raggiungibile e backend conforme al contratto atteso.
     * @post Restituisce un oggetto normalizzato con domanda, info e 4 opzioni.
     */
    async function fetchTruthValueExercise() {
        const predicateCount = 2 + Math.floor(Math.random() * 3);
        const askTrue = Math.random() < 0.5;
        const response = await fetch(truthApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                predicate_count: predicateCount,
                true_options_count: askTrue ? 1 : 3,
                false_options_count: askTrue ? 3 : 1
            })
        });
        if (!response.ok) {
            throw new Error('HTTP ' + response.status);
        }
        const payload = await response.json();
        return normalizeTruthValueResult(payload);
    }

    async function fetchQuantifierNegationExercise() {
        const vars = pickRandom(variableSets);
        const response = await fetch(equivalenceApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                variables: vars,
                wrong_answers_count: 3
            })
        });
        if (!response.ok) {
            throw new Error('HTTP ' + response.status);
        }

        const payload = await response.json();
        const normalized = normalizeEquivalenceResult(payload);
        if (!normalized || !Array.isArray(normalized.options) || normalized.options.length === 0) {
            return null;
        }

        const baseFormulaOption = normalized.options.find(function(option) {
            return option && option.correct;
        }) || normalized.options[0];

        if (!baseFormulaOption || !baseFormulaOption.text) {
            return null;
        }

        const baseFormula = prologToLogical(baseFormulaOption.text);
        const quantifier = Math.random() < 0.5 ? '∀' : '∃';
        const quantified = buildQuantifiedNegationOptions(quantifier, baseFormula);

        return {
            kind: 'quantifier-negation',
            question: quantified.question,
            info: [],
            options: quantified.options
        };
    }

    /**
     * Carica la prossima domanda scegliendo il tipo di esercizio in base al piano corrente.
     * @pre Il quiz e in stato attivo (test avviato) e i nodi UI essenziali sono disponibili.
     * @post Aggiorna domanda/opzioni/stato; in caso errore mostra fallback utente senza interrompere l'app.
     */
    async function loadExercise() {
        state.mode = 'check';
        state.locked = false;
        actionButton.textContent = 'Controlla';
        setStatus('Caricamento...');
        optionsEl.innerHTML = '';
        showInfo([]);

        try {
            const standardLoaders = [
                fetchEquivalenceExercise,
                fetchTruthValueExercise
            ];
            const pendingQuantifierNegation = Math.max(0, quantifierNegationTarget - quantifierNegationUsed);
            const questionsLeftIncludingCurrent = Math.max(0, totalExercises - currentExercise + 1);
            const mustUseQuantifierNegation = pendingQuantifierNegation > 0 && questionsLeftIncludingCurrent <= pendingQuantifierNegation;

            let loader = null;
            if (mustUseQuantifierNegation) {
                loader = fetchQuantifierNegationExercise;
            } else if (pendingQuantifierNegation > 0) {
                loader = pickRandom([
                    fetchEquivalenceExercise,
                    fetchTruthValueExercise,
                    fetchQuantifierNegationExercise
                ]);
            } else {
                loader = pickRandom(standardLoaders);
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
            if (state.spokenlanguage) {
                atomSpokenMap = buildAtomSpokenMap(collectAtomsFromExercise(parsed));
            } else {
                atomSpokenMap = {};
            }
            questionEl.textContent = applyFormulaTransforms(parsed.question);
            currentQuestionInfo = Array.isArray(parsed.info) ? parsed.info.slice() : [];
            currentTruthAssignments = extractTruthAssignments(currentQuestionInfo);
            showInfo(parsed.info);
            renderOptions();
            clearWrongActionImages();
            setStatus('Usa il mouse o le frecce per selezionare.');
            optionsEl.focus();
        } catch (err) {
            setStatus('Errore nel caricamento esercizio: ' + err.message);
            questionEl.textContent = 'Impossibile caricare l\'esercizio.';
            currentQuestionText = '';
            atomSpokenMap = {};
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
     * @pre state.options contiene esattamente 4 opzioni e state.correctIndex e valido.
     * @post Blocca la domanda corrente, aggiorna feedback visuale/testuale e registra il risultato nel recap.
     */
    function checkAnswer() {
        if (state.options.length !== 4) {
            setStatus('Nessun esercizio disponibile.');
            return;
        }

        state.locked = true;
        resetVisualFeedback();
        const selected = optionsEl.querySelector('.quiz-option.is-selected');
        if (!selected) return;

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

        const selectedFormula = getOptionDisplayFormula(state.options[state.selectedIndex]);
        const correctFormula = getOptionDisplayFormula(state.options[state.correctIndex]);


        // Calcola tempo impiegato per rispondere
        let timeToAnswer = '';
        if (questionViewTimestamps[currentExercise] != null) {
            timeToAnswer = ((Date.now() - questionViewTimestamps[currentExercise]) / 1000).toFixed(2) + 's';
        }

        // Determina tipologia domanda
        let tipoDomanda = '';
        const qText = questionEl.textContent || '';
        if (currentQuestionInfo && currentQuestionInfo.length > 0) {
            tipoDomanda = 'Ipotesi';
        } else if (/equivalente|equivalenza/i.test(qText)) {
            tipoDomanda = 'Equivalenza';
        } else if (/per ogni|esiste/i.test(qText)) {
            tipoDomanda = 'Negazione';
        }

        // Opzioni attive
        const opzioniAttive = getActiveOptions();

        // Raccogli tutte le opzioni mostrate
        let risposteMostrate = '';
        if (state.options && Array.isArray(state.options) && state.options.length === 4) {
            risposteMostrate = state.options.map(opt => {
                if (typeof opt === 'object' && opt.text) return opt.text;
                return String(opt);
            }).join(' | ');
        }

        // Domanda con eventuali ipotesi
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
            selectedAnswer: state.spokenlanguage ? applySpokenTransform(selectedFormula) : selectedFormula,
            correctAnswer: state.spokenlanguage ? applySpokenTransform(correctFormula) : correctFormula,
            isCorrect: isCorrect,
            tipoDomanda: tipoDomanda,
            tempoRisposta: timeToAnswer,
            opzioniAttive: opzioniAttive,
            risposteMostrate: risposteMostrate
        });

        setStatus('Usa il mouse o premi invio per continuare');
        actionButton.textContent = currentExercise >= totalExercises ? 'Termina' : 'Prossimo';
        state.mode = 'next';
    }

    function renderReview() {
        if (!reviewListEl) return;
        reviewListEl.innerHTML = '';

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
        // Invio automatico dati revisione direttamente all'endpoint esterno
        setTimeout(function() {
            const logDataMode = localStorage.getItem('logDataMode') || 'none';
            if (logDataMode === 'none') return;
            const scuola = localStorage.getItem('logDataSchool') || '';
            const now = Date.now();
            const tempoTotale = quizStartTimestamp ? ((now - quizStartTimestamp) / 1000).toFixed(2) + 's' : '';
            const report = {
                "Initial Data": {
                    "Scuola": scuola,
                    "Tempo inizio esercitazione": quizStartTimestamp ? quizStartTimestamp : '',
                    "Tempo totale": tempoTotale,
                    "Totale domande": reviewResults.length,
                    "Totale domande corrette": reviewResults.filter(e => e.isCorrect).length,
                    "Totale domande errate": reviewResults.filter(e => !e.isCorrect).length
                },
                "Domande": reviewResults.map(function(entry, idx) {
                    return {
                        ["Domanda nº " + (idx+1)]: {
                            "Tipologia": entry.tipoDomanda || '',
                            "Tempo impiegato per rispondere": entry.tempoRisposta || '',
                            "Opzioni attive": entry.opzioniAttive || '',
                            "Risposta è corretta": entry.isCorrect ? 'Sì' : 'No',
                            "Domanda": entry.question,
                            "Risposte": entry.risposteMostrate || '',
                            "Riposta utente": entry.selectedAnswer,
                            "Riposta corretta": entry.correctAnswer
                        }
                    };
                }),
                "Feedback": {
                    "Feedback lezioni": '',
                    "Feedback esercitazione": '',
                    "Feedback opzioni": '',
                    "Feedback difficoltà test": ''
                }
            };
            fetch('/api/revisione', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(report)
            })
            .then(res => res.json())
            .then(data => {
                // Mostra feedback all'utente (opzionale)
                console.log('Dati revisione inviati:', data);
            })
            .catch(err => {
                console.error('Errore invio revisione:', err);
            });
        }, 500);
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
        if (reviewNavEl) reviewNavEl.hidden = false;
        state.mode = 'completed';
    }

    // Ripristina stato iniziale del quiz e mostra la schermata intro.
    function showIntro() {
        currentExercise = 0;
        reviewResults.length = 0;
        currentQuestionInfo = [];
        currentTruthAssignments = {};
        atomSpokenMap = {};
        currentQuestionText = '';
        currentImageFormulaSteps = { question: [], correct: [], wrongByFormula: {} };
        quantifierNegationTarget = 0;
        quantifierNegationUsed = 0;
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
        syncWrongImagesAvailability();
        applyFormulasLayout();
        if (testTitleEl) testTitleEl.hidden = true;
        if (introTitleEl) introTitleEl.hidden = false;
        if (reviewTitleEl) reviewTitleEl.hidden = true;
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
        if (questionCountInput) questionCountInput.value = String(totalExercises);
        if (timeMinutesInput) timeMinutesInput.value = String(standardTimeMinutes);
        state.showFormulas = Boolean(showFormulasInput && showFormulasInput.checked);
        state.colorAtoms = Boolean(colorAtomsInput && colorAtomsInput.checked);
        state.spokenlanguage = Boolean(spokenLanguageInput && spokenLanguageInput.checked);
        state.showWrongActionImages = Boolean(showWrongActionImagesInput && showWrongActionImagesInput.checked);
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
                state.spokenlanguage = Boolean(spokenLanguageInput.checked);
                syncWrongImagesAvailability();
                if (state.spokenlanguage && state.options && state.options.length > 0) {
                    atomSpokenMap = buildAtomSpokenMap(collectAtomsFromExercise({
                        info: currentQuestionInfo,
                        options: state.options
                    }));
                } else {
                    atomSpokenMap = {};
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
