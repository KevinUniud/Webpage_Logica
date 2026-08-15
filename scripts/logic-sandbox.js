(function initializeLogicSandbox(global) {
    'use strict';
    function start() {
        const input = document.getElementById('sandboxFormula');
        const compareInput = document.getElementById('sandboxCompareFormula');
        const status = document.getElementById('sandboxStatus');
        const localPreview = document.getElementById('sandboxConstruction');
        const tree = document.getElementById('sandboxTree');
        const treeDetail = document.getElementById('sandboxTreeDetail');
        const result = document.getElementById('sandboxResult');
        let controller = null;

        function validateFormula(value) {
            const formula = String(value || '').trim();
            if (!formula) throw new Error('Inserisci una formula.');
            if (formula.length > 500) throw new Error('La formula supera il limite di 500 caratteri.');
            if (!/^[a-zA-Z0-9_(),\s]+$/.test(formula)) throw new Error('Usa soltanto atomi, parentesi, virgole e operatori supportati.');
            return formula;
        }

        function preview() {
            if (controller) controller.abort();
            localPreview.innerHTML = '';
            tree.innerHTML = '';
            treeDetail.textContent = '';
            try {
                const formula = validateFormula(input.value);
                const trace = global.LogicFormulaConstruction.buildFromFormula(formula);
                global.LogicFormulaConstructionRenderer.create({ container: localPreview }).show({ correct: trace, selectedIsCorrect: true });
                global.LogicFormulaTree.render(tree, trace, { detailElement: treeDetail });
                status.textContent = 'Sintassi locale riconosciuta. Puoi avviare una verifica sul backend.';
                return trace;
            } catch (error) {
                status.textContent = error.message;
                return null;
            }
        }

        async function request(path, payload) {
            if (controller) controller.abort();
            controller = new AbortController();
            status.textContent = 'Analisi in corso…';
            result.textContent = '';
            try {
                const response = await global.LogicApi.postJson(path, payload, { signal: controller.signal, timeoutMs: 20000 });
                renderResult(response.result);
                status.textContent = 'Analisi completata.';
            } catch (error) {
                if (error.code === 'REQUEST_ABORTED') return;
                status.textContent = error.message + (error.requestId ? ' (richiesta ' + error.requestId + ')' : '');
            }
        }

        function renderResult(value) {
            result.innerHTML = '';
            if (value && Array.isArray(value.vars) && Array.isArray(value.rows)) {
                const wrap = document.createElement('div');
                wrap.className = 'table';
                const table = document.createElement('table');
                const caption = document.createElement('caption');
                caption.textContent = 'Tabella di verità della formula';
                const head = document.createElement('thead');
                const headRow = document.createElement('tr');
                value.vars.concat(['Risultato']).forEach(function(name) {
                    const cell = document.createElement('th'); cell.textContent = String(name); headRow.appendChild(cell);
                });
                head.appendChild(headRow);
                const body = document.createElement('tbody');
                value.rows.forEach(function(row) {
                    const values = {};
                    (row.valuation || []).forEach(function(entry) {
                        const parts = String(entry).split('-'); values[parts[0]] = parts[1];
                    });
                    const tableRow = document.createElement('tr');
                    value.vars.map(function(name) { return values[name] || ''; }).concat([row.result]).forEach(function(cellValue) {
                        const cell = document.createElement('td'); cell.textContent = String(cellValue); tableRow.appendChild(cell);
                    });
                    body.appendChild(tableRow);
                });
                table.appendChild(caption); table.appendChild(head); table.appendChild(body); wrap.appendChild(table); result.appendChild(wrap);
                return;
            }
            const output = document.createElement('pre');
            output.textContent = JSON.stringify(value, null, 2);
            result.appendChild(output);
        }

        function analyze(path) {
            try {
                request(path, { expr: validateFormula(input.value), timeout: 10 });
            } catch (error) { status.textContent = error.message; }
        }

        input.addEventListener('input', preview);
        document.getElementById('sandboxExamples').addEventListener('change', function(event) {
            if (event.target.value) { input.value = event.target.value; preview(); }
        });
        document.getElementById('sandboxSymbols').addEventListener('click', function(event) {
            const button = event.target.closest('[data-symbol]');
            if (!button) return;
            input.setRangeText(button.dataset.symbol, input.selectionStart, input.selectionEnd, 'end');
            input.focus();
            preview();
        });
        document.getElementById('sandboxVariables').addEventListener('click', function() { analyze('/api/prolog-bridge/logic/vars-in-formula'); });
        document.getElementById('sandboxTruthTable').addEventListener('click', function() { analyze('/api/prolog-bridge/logic/truth-table-auto'); });
        document.getElementById('sandboxTautology').addEventListener('click', function() { analyze('/api/prolog-bridge/equivalence/tautology'); });
        document.getElementById('sandboxRewrite').addEventListener('click', function() { analyze('/api/prolog-bridge/rewrite/rewrite-path'); });
        document.getElementById('sandboxCompare').addEventListener('click', function() {
            try {
                request('/api/prolog-bridge/equivalence/equiv', {
                    left: validateFormula(input.value),
                    right: validateFormula(compareInput.value),
                    timeout: 10
                });
            } catch (error) { status.textContent = error.message; }
        });
        document.getElementById('sandboxClear').addEventListener('click', function() {
            if (controller) controller.abort();
            input.value = '';
            compareInput.value = '';
            result.innerHTML = '';
            preview();
        });
        preview();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})(window);
