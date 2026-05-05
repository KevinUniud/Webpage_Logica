(function() {
    /*
     * Utility condivise per quiz:
     * parsing formule, normalizzazione, conversioni e helper random.
     */

    /**
     * Alterna il tipo di parentesi per distinguere i livelli annidati.
     * @pre text e stringa o valore convertibile a stringa.
     * @post Restituisce una stringa equivalente in cui i livelli usano (), [] o {}.
     */
    function differentiateParentheses(text) {
        const source = String(text || '');
        const opens = ['(', '[', '{'];
        const closes = [')', ']', '}'];
        let depth = 0;
        let maxDepth = 0;

        for (let i = 0; i < source.length; i += 1) {
            const ch = source[i];
            if (ch === '(') {
                depth += 1;
                if (depth > maxDepth) maxDepth = depth;
            } else if (ch === ')') {
                depth = Math.max(0, depth - 1);
            }
        }

        depth = 0;
        const kindStack = [];
        let out = '';
        for (let i = 0; i < source.length; i += 1) {
            const ch = source[i];
            if (ch === '(') {
                const level = depth + 1;
                const kind = ((maxDepth - level) % 3 + 3) % 3;
                out += opens[kind];
                kindStack.push(kind);
                depth += 1;
                continue;
            }
            if (ch === ')') {
                depth = Math.max(0, depth - 1);
                const kind = kindStack.length > 0 ? kindStack.pop() : 0;
                out += closes[kind];
                continue;
            }
            out += ch;
        }
        return out;
    }

    /**
     * Effettua un parse robusto di un intero positivo.
     * @pre fallback e un numero intero positivo.
     * @post Restituisce sempre un intero >= 1 oppure fallback.
     */
    function parsePositiveInt(value, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        const rounded = Math.floor(n);
        if (rounded < 1) return fallback;
        return rounded;
    }

    function tokenizeFormula(input) {
        const tokens = [];
        let i = 0;
        while (i < input.length) {
            const c = input[i];
            if (/\s/.test(c)) {
                i += 1;
                continue;
            }
            if (c === '(' || c === ')' || c === ',') {
                tokens.push(c);
                i += 1;
                continue;
            }
            let j = i;
            while (j < input.length && /[A-Za-z0-9_]/.test(input[j])) {
                j += 1;
            }
            if (j === i) {
                i += 1;
                continue;
            }
            tokens.push(input.slice(i, j));
            i = j;
        }
        return tokens;
    }

    function parsePrologFormula(input) {
        const tokens = tokenizeFormula(input || '');
        let idx = 0;

        function parseNode() {
            if (idx >= tokens.length) return null;
            const token = tokens[idx];

            if (token === '(' || token === ')' || token === ',') {
                return null;
            }

            idx += 1;
            if (tokens[idx] === '(') {
                idx += 1;
                const args = [];
                while (idx < tokens.length && tokens[idx] !== ')') {
                    const arg = parseNode();
                    if (arg) args.push(arg);
                    if (tokens[idx] === ',') idx += 1;
                }
                if (tokens[idx] === ')') idx += 1;
                return { type: 'call', name: token.toLowerCase(), args: args };
            }

            return { type: 'var', name: token };
        }

        return parseNode();
    }

    function formatAst(ast, parentPrec) {
        if (!ast) return '';

        if (ast.type === 'var') {
            return ast.name;
        }

        if (ast.type !== 'call') {
            return '';
        }

        const name = ast.name;
        const args = ast.args || [];

        if (name === 'not' && args.length === 1) {
            const inner = formatAst(args[0], 4);
            const text = '¬' + inner;
            return parentPrec > 4 ? '(' + text + ')' : text;
        }

        if ((name === 'forall' || name === 'exists') && args.length === 2) {
            const quantifier = name === 'forall' ? '∀' : '∃';
            const variable = String(formatAst(args[0], -1) || '').trim().toLowerCase();
            const bodyRaw = String(formatAst(args[1], -1) || '').trim();
            const body = bodyRaw
                ? (bodyRaw[0] === '(' && bodyRaw[bodyRaw.length - 1] === ')' ? bodyRaw : '(' + bodyRaw + ')')
                : '()';
            return quantifier + variable + ' ' + body;
        }

        const binaryMap = {
            and: { symbol: '∧', prec: 3 },
            or: { symbol: '∨', prec: 2 },
            imp: { symbol: '→', prec: 1 },
            equiv: { symbol: '↔', prec: 0 },
            iff: { symbol: '↔', prec: 0 }
        };

        function isMixedAndOrChild(parentName, child) {
            return Boolean(
                child &&
                child.type === 'call' &&
                (parentName === 'and' || parentName === 'or') &&
                (child.name === 'and' || child.name === 'or') &&
                child.name !== parentName
            );
        }

        function wrapIfMissing(text) {
            const value = String(text || '').trim();
            if (!value) return value;
            if (value[0] === '(' && value[value.length - 1] === ')') return value;
            return '(' + value + ')';
        }

        const op = binaryMap[name];
        if (op && args.length === 2) {
            let left = formatAst(args[0], op.prec);
            let right = formatAst(args[1], op.prec + (name === 'imp' ? 1 : 0));

            if (isMixedAndOrChild(name, args[0])) {
                left = wrapIfMissing(left);
            }
            if (isMixedAndOrChild(name, args[1])) {
                right = wrapIfMissing(right);
            }

            const text = left + ' ' + op.symbol + ' ' + right;
            const needsParens = parentPrec > op.prec || name === 'equiv' || name === 'iff';
            return needsParens ? '(' + text + ')' : text;
        }

        const renderedArgs = args.map(function(arg) {
            return formatAst(arg, -1);
        }).join(', ');
        return name + '(' + renderedArgs + ')';
    }

    /**
     * Traduce la formula Prolog nella notazione logica leggibile.
     * @pre formula e una stringa Prolog-like oppure vuota.
     * @post Restituisce una stringa renderizzata con simboli logici o la formula originale se non parsabile.
     */
    function prologToLogical(formula) {
        if (!formula || typeof formula !== 'string') return '';
        const ast = parsePrologFormula(formula);
        const rendered = formatAst(ast, -1).trim();
        return rendered || formula;
    }

    /**
     * Miscelazione Fisher-Yates non distruttiva.
     * @pre arr e un array.
     * @post Restituisce un nuovo array con gli stessi elementi in ordine casuale.
     */
    function shuffle(arr) {
        const out = arr.slice();
        for (let i = out.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = out[i];
            out[i] = out[j];
            out[j] = tmp;
        }
        return out;
    }

    /**
     * Estrae un elemento casuale da un array.
     * @pre arr contiene almeno un elemento.
     * @post Restituisce uno degli elementi presenti in arr.
     */
    function pickRandom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    /**
     * Normalizza un nome per ottenere una chiave stabile indipendente da maiuscole/spazi.
     * @pre value e una stringa o un valore convertibile a stringa.
     * @post Restituisce una chiave in lowercase, trim e normalizzazione Unicode.
     */
    function normalizeNameKey(value) {
        return String(value || '')
            .normalize('NFKC')
            .trim()
            .toLowerCase();
    }

    /**
     * Verifica se un'etichetta rappresenta un riferimento generico a persona.
     * @pre value e una stringa o un valore convertibile a stringa.
     * @post Restituisce true per label generiche come "persona" o "la persona".
     */
    function isGenericPersonLabel(value) {
        const key = normalizeNameKey(value).replace(/\s+/g, ' ');
        return key === 'persona' || key === 'la persona';
    }

    /**
     * Hash deterministico non crittografico per mappare stringhe a interi.
     * @pre input e una stringa.
     * @post Restituisce un intero senza segno stabile tra esecuzioni.
     */
    function stableStringHash(input) {
        let hash = 5381;
        for (let i = 0; i < input.length; i += 1) {
            hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
        }
        return hash >>> 0;
    }

    /**
     * Restituisce un colore deterministico per un nome.
     * @pre palette e un array non vuoto di colori CSS validi.
     * @post Stesso nome normalizzato produce sempre lo stesso colore della palette.
     */
    function getDeterministicNameColor(name, palette) {
        const key = normalizeNameKey(name);
        if (!key || !Array.isArray(palette) || palette.length === 0) return '';
        const index = stableStringHash(key) % palette.length;
        return palette[index];
    }

    window.quizShared = {
        differentiateParentheses: differentiateParentheses,
        parsePositiveInt: parsePositiveInt,
        tokenizeFormula: tokenizeFormula,
        parsePrologFormula: parsePrologFormula,
        formatAst: formatAst,
        prologToLogical: prologToLogical,
        shuffle: shuffle,
        pickRandom: pickRandom,
        normalizeNameKey: normalizeNameKey,
        isGenericPersonLabel: isGenericPersonLabel,
        getDeterministicNameColor: getDeterministicNameColor
    };
})();
