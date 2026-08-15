const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const quizSource = fs.readFileSync('scripts/quiz.js', 'utf8');

test('URL configuration is followed by a counter synchronization', () => {
    const initializationStart = quizSource.lastIndexOf('showIntro();');
    const initialization = quizSource.slice(initializationStart);
    const applyIndex = initialization.indexOf('applyUrlConfiguration();');
    const syncIndex = initialization.indexOf('syncTypeCountTotal();', applyIndex);

    assert.ok(initializationStart >= 0);
    assert.ok(applyIndex >= 0);
    assert.ok(syncIndex > applyIndex);
});

test('spoken mode keeps translation enabled in batch and fallback flows', () => {
    assert.doesNotMatch(quizSource, /questionTypes:\s*spokenlanguageMode\s*\?/);
    assert.doesNotMatch(quizSource, /availableLoaders\s*=\s*state\.spokenlanguage\s*\?/);
    assert.match(quizSource, /questionTypes:\s*currentQuizConfig\.questionTypes/);
    assert.match(quizSource, /LogicQuizConfig\.allowedOperations\(currentQuizConfig\)/);
    assert.match(quizSource, /buildAtomSpokenMap\(parsed\)/);
    assert.match(quizSource, /quizShared\.resolveSpokenMap\(/);
});

test('batch fallback preserves and consumes the configured operation plan', () => {
    const catchStart = quizSource.indexOf('catch (batchErr)');
    const catchEnd = quizSource.indexOf('// Se batch non ha fornito risposta valida', catchStart);
    const catchBlock = quizSource.slice(catchStart, catchEnd);

    assert.ok(catchStart >= 0 && catchEnd > catchStart);
    assert.doesNotMatch(catchBlock, /batchOperationsPlan = \[\]/);
    assert.match(catchBlock, /loadFallbackExercise\(batchCacheIndex\)/);
    assert.match(quizSource, /function loadFallbackExercise\(planIndex\)[\s\S]*?batchOperationsPlan\[normalizedIndex\]/);
    assert.match(quizSource, /resolveFallbackOperation\([\s\S]*?planned && planned\.operation/);
});

test('advancing clears persisted selection and resume restores the original start time', () => {
    assert.match(quizSource, /currentExercise \+= 1;\s*state\.selectedIndex = null;/);
    assert.match(quizSource, /persistSession\(\{ currentIndex: currentExercise, phase: 'check', selectedIndex: null \}\)/);
    assert.match(quizSource, /activeSession = session;\s*quizStartTimestamp = Number\(session\.createdAt\) \|\| Date\.now\(\);/);
});

test('radio keyboard handling selects the focused option without submitting the answer', () => {
    const keydownStart = quizSource.indexOf("optionsEl.addEventListener('keydown'");
    const keydownEnd = quizSource.indexOf("actionButton.addEventListener('click'", keydownStart);
    const keydownBlock = quizSource.slice(keydownStart, keydownEnd);

    assert.ok(keydownStart >= 0 && keydownEnd > keydownStart);
    assert.match(keydownBlock, /const option = evt\.target\.closest\('\.quiz-option'\)/);
    assert.match(keydownBlock, /evt\.key === 'Enter' \|\| evt\.key === ' '/);
    assert.match(keydownBlock, /selectIndex\(optionIndex, true\)/);
    assert.doesNotMatch(keydownBlock, /actionButton\.click\(\)/);
    assert.match(quizSource, /state\.selectedIndex = null;[\s\S]*?renderOptions\(\)/);
    assert.match(quizSource, /function selectIndex\(idx, shouldFocus\)[\s\S]*?actionButton\.disabled = false;/);
});

test('exercise markup labels the radio group and exposes a disabled primary check action initially', () => {
    const html = fs.readFileSync('esercizi/esercitazione.html', 'utf8');
    assert.match(html, /id="quizOptions"[^>]*role="radiogroup"[^>]*aria-labelledby="quizQuestion"/);
    assert.doesNotMatch(html, /id="quizOptions"[^>]*tabindex=/);
    assert.match(html, /id="quizActionButton"[^>]*disabled>Controlla la risposta<\/button>/);
});

test('exercise page restores the compact configuration without losing accessibility fixes', () => {
    const html = fs.readFileSync('esercizi/esercitazione.html', 'utf8');
    const css = fs.readFileSync('styles/quiz.css', 'utf8');
    assert.match(html, /id="quizIntroTitle">Impostazioni<\/h1>/);
    assert.doesNotMatch(html, /quiz-config-sections|quiz-config-section-heading|quiz-choice-card/);
    assert.match(html, /id="quizReviewNav"[^>]*class="rounded-box lesson-nav"/);
    ['Modalità:', 'Difficoltà:', 'Valore di verità', 'Formule di riferimento'].forEach(label => {
        assert.match(html, new RegExp(label));
    });
    assert.match(html, /id="quizStartButton"[^>]*>Inizia il quiz<\/button>/);
    assert.match(css, /\.quiz-box\s*\{[\s\S]*?max-width:\s*760px;[\s\S]*?margin:\s*24px auto;/);
    assert.match(css, /\.quiz-review-title\s*\{[\s\S]*?display:\s*flex;[\s\S]*?gap:\s*6px;/);
    assert.match(css, /\.quiz-review-answer-row\s*\{[\s\S]*?display:\s*flex;[\s\S]*?gap:\s*6px;/);
    assert.match(css, /lesson-radio-option:has\(\.lesson-radio-input:focus-visible\)/);
    assert.match(css, /body\.quiz-formulas-mode\s*\{[\s\S]*?padding-inline:\s*0;/);
});

test('quiz timer remains absent from the configurator while it has the hidden attribute', () => {
    const css = fs.readFileSync('styles/quiz.css', 'utf8');
    assert.match(css, /\.quiz-timer\[hidden\]\s*\{\s*display:\s*none;\s*\}/);
});

test('quiz demographics avoid localStorage and cleared sessions reset the resume state', () => {
    assert.doesNotMatch(quizSource, /localStorage\.(?:getItem|setItem|removeItem)\(['"]logData/);
    assert.match(quizSource, /LogicQuizReport\.readDemographics\(\{[\s\S]*?age:\s*logDataAgeInput/);
    assert.match(quizSource, /LogicAppEvents\.on\('privacy:sessions-clearing', clearActiveSessionState\)/);
    assert.match(quizSource, /LogicAppEvents\.on\('privacy:sessions-cleared', clearActiveSessionState\)/);
    assert.match(quizSource, /LogicAppEvents\.on\('privacy:data-clearing', clearActiveSessionState\)/);
    assert.match(quizSource, /LogicAppEvents\.on\('privacy:data-cleared', clearActiveSessionState\)/);
    assert.match(quizSource, /function clearActiveSessionState\(\)[\s\S]*?activeSession = null;[\s\S]*?resumePanelEl\.hidden = true;/);
});

test('lesson section IDs match their case-sensitive filenames', () => {
    ['4', '5'].forEach(number => {
        const html = fs.readFileSync('lezioni/lezione-' + number + '.html', 'utf8');
        assert.match(html, new RegExp('<body data-lesson-id="lesson-' + number + '">'));
        assert.match(html, new RegExp('<section id="lezione-' + number + '">'));
    });
});
