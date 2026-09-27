/* A living graph. One class, reused by every scene that shows nodes and edges. */

class LivingGraph {
  constructor(svg, opts = {}) {
    this.svg = d3.select(svg);
    this.opts = opts;
    this.verified = opts.verified !== undefined ? opts.verified : false;
    this.nodes = [];
    this.edges = [];
    this.visibleIds = null; // null = show everything
    this.hidden = new Set();

    this.root = this.svg.append("g").attr("class", "graph-root");
    this.edgeLayer = this.root.append("g").attr("class", "edges");
    this.ghostLayer = this.root.append("g").attr("class", "ghosts");
    this.nodeLayer = this.root.append("g").attr("class", "nodes");
    this.labelLayer = this.root.append("g").attr("class", "edge-labels");

    this.resize();
    this.sim = d3.forceSimulation()
      .force("link", d3.forceLink().id(d => d.id).distance(opts.distance || 175).strength(0.7))
      .force("charge", d3.forceManyBody().strength(opts.charge || -700))
      .force("collide", d3.forceCollide(48))
      .force("center", d3.forceCenter(this.w / 2, this.h / 2).strength(0.06))
      .alphaDecay(0.03)
      .velocityDecay(0.35)
      .on("tick", () => this.tick());

    this._breathe = 0;
    this._breathing = true;
    this._loop();
  }

  resize() {
    const box = this.svg.node().getBoundingClientRect();
    this.w = box.width || 800;
    this.h = box.height || 600;
    this.padTop = this.opts.padTop || 60;
    const cy = (this.padTop + this.h) / 2;
    if (this.sim) {
      const room = Math.min(this.w, this.h - this.padTop);
      const dist = Math.max(105, Math.min(this.opts.distance || 175, room * 0.28));
      this.sim.force("link").distance(dist);
      this.sim.force("charge").strength(-Math.max(320, Math.min(700, room * 1.1)));
      this.sim.force("center", d3.forceCenter(this.w / 2, cy).strength(0.06)).alpha(0.8).restart();
    }
  }

  /* Keep the graph faintly alive even when the simulation has settled. */
  _loop() {
    if (!this._breathing) return;
    this._breathe += 0.01;
    if (this.sim.alpha() < 0.02) {
      this.sim.alpha(0.02).restart();
    }
    requestAnimationFrame(() => this._loop());
  }

  stop() { this._breathing = false; this.sim.stop(); }

  /* Screen elements the graph must not run under (titles, panels, legends). */
  avoid(getElements) {
    this._avoidFn = getElements;
    this.sim.alpha(0.5).restart();
  }
  _obstacles() {
    if (!this._avoidFn) return [];
    const els = Array.from(this._avoidFn());
    if (!els.length) return [];
    const box = this.svg.node().getBoundingClientRect();
    const m = 70; // margin so labels clear the box too
    return els.map(el => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return { x1: r.left - box.left - m, y1: r.top - box.top - m, x2: r.right - box.left + m, y2: r.bottom - box.top + m };
    }).filter(Boolean);
  }

  /* Load a graph. If the shape matches what is already on screen, relabel in place. */
  setData(data, { relabel = false } = {}) {
    const sameShape = relabel && this.nodes.length === data.nodes.length &&
      this.edges.length === data.edges.length;

    if (sameShape) {
      data.nodes.forEach((n, i) => {
        Object.assign(this.nodes[i], { name: n.name, type: n.type, props: n.props });
      });
      data.edges.forEach((e, i) => {
        Object.assign(this.edges[i], { verb: e.verb, props: e.props || null });
      });
      this.render();
      this.nodeLayer.selectAll(".node").each(function () {
        const g = d3.select(this);
        g.select(".node-name").interrupt().style("opacity", 0).transition().duration(600).style("opacity", 1);
        g.select(".node-type").interrupt().style("opacity", 0).transition().duration(600).style("opacity", 1);
        g.select(".node-core").transition().duration(250).attr("r", 13).transition().duration(450).attr("r", 9);
      });
      this.sim.alpha(0.15).restart();
      return;
    }

    const prev = new Map(this.nodes.map(n => [n.id, n]));
    this.nodes = data.nodes.map(n => {
      const old = prev.get(n.id);
      const x = old ? old.x : this.w / 2 + (Math.random() - 0.5) * 60;
      const y = old ? old.y : this.h / 2 + (Math.random() - 0.5) * 60;
      return { ...n, x, y };
    });
    this.edges = data.edges.map(e => ({ ...e }));
    this.sim.nodes(this.nodes);
    this.sim.force("link").links(this.edges);
    this.render();
    this.sim.alpha(0.9).restart();
  }

  /* Only show some nodes (used by the opening, where nodes arrive one at a time). */
  reveal(ids) {
    this.visibleIds = ids ? new Set(ids) : null;
    this.render();
    this.sim.alpha(0.6).restart();
  }

  setVerified(v) {
    this.verified = v;
    this.svg.classed("verified", v).classed("drafted", !v);
  }

  render() {
    const show = n => !this.visibleIds || this.visibleIds.has(n.id);
    const showE = e => show(this._n(e.source)) && show(this._n(e.target));
    this.svg.classed("verified", this.verified).classed("drafted", !this.verified);

    /* edges */
    const edgeSel = this.edgeLayer.selectAll(".edge").data(this.edges.filter(showE), d => d.id);
    edgeSel.exit().transition().duration(300).style("opacity", 0).remove();
    const edgeEnter = edgeSel.enter().append("path")
      .attr("class", "edge")
      .attr("marker-end", "url(#arrow)")
      .style("opacity", 0);
    edgeEnter.transition().duration(500).style("opacity", 1);
    this.edgeSel = edgeEnter.merge(edgeSel);
    this.edgeSel
      .on("mouseenter", (ev, d) => { this.showVerb(d); this.opts.onHoverEdge && this.opts.onHoverEdge(d); })
      .on("mouseleave", (ev, d) => { this.hideVerb(d); this.opts.onHoverEdge && this.opts.onHoverEdge(null); });

    /* edge labels */
    const labSel = this.labelLayer.selectAll(".edge-label").data(this.edges.filter(showE), d => d.id);
    labSel.exit().remove();
    const labEnter = labSel.enter().append("g").attr("class", "edge-label");
    labEnter.append("rect").attr("rx", 6);
    labEnter.append("text").attr("text-anchor", "middle").attr("dy", "0.35em");
    this.labSel = labEnter.merge(labSel);
    this.labSel.select("text").text(d => d.verb);
    this.labSel.each(function () {
      const g = d3.select(this);
      const bb = g.select("text").node().getBBox();
      g.select("rect").attr("x", bb.x - 8).attr("y", bb.y - 4).attr("width", bb.width + 16).attr("height", bb.height + 8);
    });

    /* nodes */
    const nodeSel = this.nodeLayer.selectAll(".node").data(this.nodes.filter(show), d => d.id);
    nodeSel.exit().transition().duration(300).style("opacity", 0).remove();
    const nodeEnter = nodeSel.enter().append("g").attr("class", "node").style("opacity", 0);
    nodeEnter.append("circle").attr("class", "node-halo").attr("r", 0);
    nodeEnter.append("circle").attr("class", "node-core").attr("r", 0);
    nodeEnter.append("text").attr("class", "node-name").attr("text-anchor", "middle").attr("dy", 30);
    nodeEnter.append("text").attr("class", "node-type").attr("text-anchor", "middle").attr("dy", 46);
    nodeEnter.transition().duration(500).style("opacity", 1);
    nodeEnter.select(".node-halo").transition().duration(700).ease(d3.easeElasticOut).attr("r", 22);
    nodeEnter.select(".node-core").transition().duration(700).ease(d3.easeElasticOut).attr("r", 9);
    this.nodeSel = nodeEnter.merge(nodeSel);
    this.nodeSel.select(".node-name").text(d => d.name);
    this.nodeSel.select(".node-type").text(d => d.type);
    this.nodeSel
      .call(d3.drag()
        .on("start", (ev, d) => { if (!ev.active) this.sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
        .on("end", (ev, d) => { if (!ev.active) this.sim.alphaTarget(0); d.fx = null; d.fy = null; }))
      .on("mouseenter", (ev, d) => { d3.select(ev.currentTarget).classed("hover", true); this.opts.onHoverNode && this.opts.onHoverNode(d, ev); })
      .on("mouseleave", (ev, d) => { d3.select(ev.currentTarget).classed("hover", false); this.opts.onHoverNode && this.opts.onHoverNode(null, ev); })
      .on("click", (ev, d) => { this.opts.onClickNode && this.opts.onClickNode(d, ev); });
    this.tick();
  }

  _n(ref) { return typeof ref === "object" ? ref : this.nodes.find(n => n.id === ref); }

  tick() {
    if (!this.edgeSel) return;
    const pad = 95, top = this.padTop || 60;
    const obs = this._obstacles();
    this.nodes.forEach(n => {
      n.x = Math.max(pad, Math.min(this.w - pad, n.x));
      n.y = Math.max(top, Math.min(this.h - pad, n.y));
      obs.forEach(o => {
        if (n.x > o.x1 && n.x < o.x2 && n.y > o.y1 && n.y < o.y2) {
          const dl = n.x - o.x1, dr = o.x2 - n.x, dt = n.y - o.y1, db = o.y2 - n.y;
          const min = Math.min(dl, dr, dt, db);
          if (min === dl) n.x = o.x1; else if (min === dr) n.x = o.x2; else if (min === dt) n.y = o.y1; else n.y = o.y2;
          n.vx *= 0.5; n.vy *= 0.5;
          n.x = Math.max(pad, Math.min(this.w - pad, n.x));
          n.y = Math.max(top, Math.min(this.h - pad, n.y));
        }
      });
    });
    this.edgeSel.attr("d", d => this._path(d.source, d.target));
    this.labSel.attr("transform", d => {
      const mx = (d.source.x + d.target.x) / 2, my = (d.source.y + d.target.y) / 2;
      return `translate(${mx},${my})`;
    });
    this.nodeSel.attr("transform", d => `translate(${d.x},${d.y})`);
    this.ghostLayer.selectAll(".ghost").attr("d", d => this._path(this._n(d.source), this._n(d.target)));
    this.ghostLayer.selectAll(".ghost-label").attr("transform", d => {
      const s = this._n(d.source), t = this._n(d.target);
      return `translate(${(s.x + t.x) / 2},${(s.y + t.y) / 2})`;
    });
  }

  /* A slightly curved stroke that stops short of the target node. */
  _path(s, t) {
    const dx = t.x - s.x, dy = t.y - s.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const sx = s.x + ux * 14, sy = s.y + uy * 14;
    const tx = t.x - ux * 18, ty = t.y - uy * 18;
    const cx = (sx + tx) / 2 - uy * len * 0.12, cy = (sy + ty) / 2 + ux * len * 0.12;
    return `M${sx},${sy} Q${cx},${cy} ${tx},${ty}`;
  }

  showVerb(d) { this.labSel.filter(x => x.id === d.id).classed("on", true); }
  hideVerb(d) { this.labSel.filter(x => x.id === d.id && !x._pinned).classed("on", false); }

  showAllVerbs(on) { this.labSel.classed("on", on); }

  /* Light up a set of edges in order, one after another. Returns a promise. */
  highlightPath(edgeIds, { stepMs = 450, clear = true } = {}) {
    if (clear) this.clearHighlights();
    return new Promise(resolve => {
      edgeIds.forEach((id, i) => {
        setTimeout(() => {
          const e = this.edges.find(x => x.id === id);
          if (!e) return;
          this.edgeSel.filter(x => x.id === id).classed("lit", true);
          this.labSel.filter(x => x.id === id).classed("on", true).each(x => x._pinned = true);
          this.nodeSel.filter(n => n.id === this._n(e.source).id || n.id === this._n(e.target).id).classed("lit", true);
          if (i === edgeIds.length - 1) setTimeout(resolve, 300);
        }, i * stepMs);
      });
      if (!edgeIds.length) resolve();
    });
  }

  clearHighlights() {
    if (!this.edgeSel) return;
    this.edgeSel.classed("lit", false).classed("yes", false).classed("no", false);
    this.nodeSel.classed("lit", false).classed("mark", false);
    this.labSel.classed("on", false).each(x => x._pinned = false);
    this.ghostLayer.selectAll("*").remove();
  }

  markNode(id, on = true) { this.nodeSel.filter(n => n.id === id).classed("mark", on); }

  /* Test one claimed link against the graph. Draws a red ghost edge when it is missing. */
  testLink(link) {
    const found = this.edges.find(e => this._n(e.source).id === link.source && this._n(e.target).id === link.target);
    if (found) {
      this.edgeSel.filter(x => x.id === found.id).classed("yes", true).classed("lit", true);
      this.labSel.filter(x => x.id === found.id).classed("on", true).each(x => x._pinned = true);
      this.pulseEdge(found.id);
      return true;
    }
    const g = this.ghostLayer;
    g.append("path").datum(link).attr("class", "ghost");
    const lab = g.append("g").datum(link).attr("class", "ghost-label");
    lab.append("rect").attr("rx", 6);
    lab.append("text").attr("text-anchor", "middle").attr("dy", "0.35em").text(link.verb + "?");
    const bb = lab.select("text").node().getBBox();
    lab.select("rect").attr("x", bb.x - 8).attr("y", bb.y - 4).attr("width", bb.width + 16).attr("height", bb.height + 8);
    this.tick();
    return false;
  }

  pulseEdge(id) {
    const el = this.edgeSel.filter(x => x.id === id).node();
    if (!el) return;
    gsap.fromTo(el, { strokeWidth: 6, opacity: 1 }, { strokeWidth: 2.5, duration: 0.9, ease: "power2.out" });
  }

  nodePos(id) {
    const n = this.nodes.find(x => x.id === id);
    if (!n) return null;
    const box = this.svg.node().getBoundingClientRect();
    return { x: box.left + n.x, y: box.top + n.y };
  }

  /* Camera moves between scenes. */
  focus({ x, y, k = 1 }, ms = 900) {
    const tx = this.w / 2 - x * k, ty = this.h / 2 - y * k;
    this.root.transition().duration(ms).ease(d3.easeCubicInOut)
      .attr("transform", `translate(${tx},${ty}) scale(${k})`);
  }
  resetCamera(ms = 900) {
    this.root.transition().duration(ms).ease(d3.easeCubicInOut).attr("transform", "translate(0,0) scale(1)");
  }
}

window.LivingGraph = LivingGraph;
