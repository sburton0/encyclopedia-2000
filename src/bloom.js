// Draws the translucent "bloom" of overlapping petals into an SVG <g>.
// Requires #pet (petal gradient) in the document's SVG defs.
window.makeBloom = function makeBloom(g, scale = 1, opts = {}) {
  const NS = 'http://www.w3.org/2000/svg';
  const layers = [[16, 70, 250, 0, 0.75], [12, 55, 180, 11, 0.7], [10, 38, 115, 5, 0.85]];
  layers.forEach(([count, rx, ry, offset, opacity], layer) => {
    for (let i = 0; i < count; i++) {
      const petal = document.createElementNS(NS, 'ellipse');
      petal.setAttribute('cx', 0);
      petal.setAttribute('cy', -ry * scale);
      petal.setAttribute('rx', rx * scale);
      petal.setAttribute('ry', ry * scale);
      petal.setAttribute('fill', 'url(#pet)');
      petal.setAttribute('opacity', opacity);
      petal.setAttribute('stroke', '#e6efff');
      petal.setAttribute('stroke-opacity', '.18');
      petal.setAttribute('transform', `rotate(${(i * 360) / count + offset})`);
      if (opts.animate) {
        const wrap = document.createElementNS(NS, 'g');
        wrap.setAttribute('class', 'petal');
        wrap.style.animationDelay = (layer * 0.28 + i * 0.045).toFixed(3) + 's';
        wrap.append(petal);
        g.append(wrap);
      } else {
        g.append(petal);
      }
    }
  });
};
