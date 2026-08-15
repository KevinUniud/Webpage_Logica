/* Albero SVG deterministico derivato dal contratto construction.steps. */
(function exposeFormulaTree(global) {
    'use strict';
    const NS = 'http://www.w3.org/2000/svg';

    function toGraph(trace) {
        const steps = trace && Array.isArray(trace.steps) ? trace.steps : [];
        const nodes = steps.map(function(step) {
            return {
                id: String(step.node_id),
                label: String(step.result_prolog || step.operator || step.node_id),
                depth: Number(step.depth) || 0,
                step: step,
                operands: Array.isArray(step.operands) ? step.operands.map(String) : []
            };
        });
        const ids = new Set(nodes.map(function(node) { return node.id; }));
        const edges = [];
        nodes.forEach(function(node) {
            node.operands.forEach(function(operand) {
                if (ids.has(operand)) edges.push({ from: operand, to: node.id });
            });
        });
        return { nodes: nodes, edges: edges };
    }

    function render(container, trace, options) {
        if (!container) return null;
        container.innerHTML = '';
        const graph = toGraph(trace);
        if (!graph.nodes.length) {
            container.textContent = 'Albero non disponibile per questa formula.';
            return null;
        }
        const width = 760;
        const height = Math.max(180, (Math.max(...graph.nodes.map(function(node) { return node.depth; })) + 1) * 120);
        const byDepth = {};
        graph.nodes.forEach(function(node) {
            if (!byDepth[node.depth]) byDepth[node.depth] = [];
            byDepth[node.depth].push(node);
        });
        const positions = {};
        Object.keys(byDepth).forEach(function(depthKey) {
            const level = byDepth[depthKey];
            level.forEach(function(node, index) {
                positions[node.id] = {
                    x: ((index + 1) * width) / (level.length + 1),
                    y: height - (Number(depthKey) * 110) - 55
                };
            });
        });
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', 'Albero di costruzione della formula, con ' + graph.nodes.length + ' nodi');
        svg.classList.add('chart-svg');
        graph.edges.forEach(function(edge) {
            const from = positions[edge.from];
            const to = positions[edge.to];
            if (!from || !to) return;
            const line = document.createElementNS(NS, 'line');
            line.setAttribute('x1', String(from.x));
            line.setAttribute('y1', String(from.y));
            line.setAttribute('x2', String(to.x));
            line.setAttribute('y2', String(to.y));
            line.setAttribute('class', 'formula-tree-edge');
            svg.appendChild(line);
        });
        graph.nodes.forEach(function(node) {
            const position = positions[node.id];
            const group = document.createElementNS(NS, 'g');
            group.setAttribute('tabindex', '0');
            group.setAttribute('role', 'button');
            group.setAttribute('aria-label', 'Passaggio ' + node.step.index + ': ' + node.label);
            const circle = document.createElementNS(NS, 'circle');
            circle.setAttribute('cx', String(position.x));
            circle.setAttribute('cy', String(position.y));
            circle.setAttribute('r', '28');
            circle.setAttribute('class', 'formula-tree-node');
            const text = document.createElementNS(NS, 'text');
            text.setAttribute('x', String(position.x));
            text.setAttribute('y', String(position.y + 4));
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('class', 'formula-tree-label');
            const shortLabel = node.label.length > 11 ? node.label.slice(0, 10) + '…' : node.label;
            text.textContent = shortLabel;
            const select = function() {
                if (options && options.detailElement) {
                    options.detailElement.textContent = 'Passaggio ' + node.step.index + ': ' + node.label
                        + (node.step.operator ? '. Operatore: ' + node.step.operator : '');
                }
            };
            group.addEventListener('click', select);
            group.addEventListener('keydown', function(event) {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); }
            });
            group.appendChild(circle);
            group.appendChild(text);
            svg.appendChild(group);
        });
        container.appendChild(svg);
        return graph;
    }

    global.LogicFormulaTree = Object.freeze({ render: render, toGraph: toGraph });
})(window);
