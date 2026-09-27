/* The ten scenes. Each one mounts into the stage, answers key presses,
   and cleans up after itself. Text and data come from content.js. */

const C = window.CONTENT;

/* ---------- shared bits ---------- */

function header(scene, extra) {
  const h = U.el("header", "scene-head");
  h.appendChild(U.el("h1", "scene-title", scene.title));
  if (scene.sub) h.appendChild(U.el("p", "scene-sub", scene.sub));
  if (scene.lines && scene.lines.length) {
    const ul = U.el("ul", "scene-lines");
    scene.lines.forEach(l => ul.appendChild(U.el("li", null, l)));
    h.appendChild(ul);
  }
  if (extra) h.appendChild(extra);
  return h;
}

/* The two-example switch used by every example scene. */
function variantSwitch(ctx, genericLabel, onChange, opsLabel) {
  const wrap = U.el("div", "variant");
  const a = U.el("button", "variant-btn", genericLabel);
  const b = U.el("button", "variant-btn", opsLabel || "IT operations");
  const sync = () => {
    a.classList.toggle("on", ctx.variant === "generic");
    b.classList.toggle("on", ctx.variant === "ops");
  };
  a.onclick = () => { ctx.variant = "generic"; sync(); onChange("generic"); };
  b.onclick = () => { ctx.variant = "ops"; sync(); onChange("ops"); };
  wrap.append(a, b);
  sync();
  wrap.sync = sync;
  return wrap;
}

function propsCard(node) {
  const card = U.el("div", "props-card");
  card.appendChild(U.el("div", "props-title", `${U.esc(node.name)} <span>${U.esc(node.type)}</span>`));
  const dl = U.el("dl");
  Object.entries(node.props || {}).forEach(([k, v]) => {
    dl.appendChild(U.el("dt", null, U.esc(k.replace(/_/g, " "))));
    dl.appendChild(U.el("dd", null, U.esc(v)));
  });
  card.appendChild(dl);
  return card;
}

/* ---------- Scene 0: opening ---------- */
const sceneOpen = {
  key: "open",
  order: ["n0", "n1", "n2", "n6", "n3"],
  mount(stage, ctx) {
    this.i = 0;
    ctx.showGraph(true);
    ctx.graph.setVerified(false);
    ctx.graph.setData(C.graphs.hospital);
    ctx.graph.reveal([]);
    ctx.graph.resetCamera(0);
    this.head = header(C.scenes[0]);
    this.head.classList.add("centered");
    stage.appendChild(this.head);
    gsap.set(this.head, { xPercent: -50, yPercent: -50 });
    this.hint = U.el("p", "hint", "Press → to begin");
    stage.appendChild(this.hint);
  },
  step(ctx) {
    if (this.i >= this.order.length) return false;
    this.i++;
    ctx.graph.reveal(this.order.slice(0, this.i));
    if (this.i === 1) {
      this.hint.remove();
      const title = this.head.querySelector(".scene-title");
      const sub = this.head.querySelector(".scene-sub");
      gsap.to(sub, { opacity: 0, duration: 0.3 });
      gsap.to(this.head, { left: 72, top: 44, xPercent: 0, yPercent: 0, textAlign: "left", duration: 0.9, ease: "power3.inOut" });
      gsap.to(title, { fontSize: 28, lineHeight: 1.15, duration: 0.9, ease: "power3.inOut", onComplete: () => { title.style.whiteSpace = "nowrap"; } });
    }
    if (this.i >= 3) ctx.graph.showAllVerbs(true);
    return true;
  },
  unmount(ctx) { ctx.graph.showAllVerbs(false); }
};

/* ---------- Scene 1: what a knowledge graph is ---------- */
const sceneWhat = {
  key: "what",
  mount(stage, ctx) {
    this.step_ = 0;
    ctx.showGraph(true);
    ctx.graph.reveal(null);
    ctx.graph.setVerified(false);
    ctx.graph.resetCamera();
    const data = ctx.variant === "ops" ? C.graphs.ops : C.graphs.hospital;
    ctx.graph.setData(data, { relabel: true });

    this.sw = variantSwitch(ctx, "Hospital", v => {
      ctx.graph.setData(v === "ops" ? C.graphs.ops : C.graphs.hospital, { relabel: true });
    });
    stage.appendChild(header(C.scenes[1], this.sw));

    const legend = U.el("div", "legend");
    legend.innerHTML = `
      <div><i class="dot node"></i>Nouns are nodes</div>
      <div><i class="dot edge"></i>Verbs are edges</div>
      <div><i class="dot prop"></i>Adjectives are properties</div>`;
    stage.appendChild(legend);

    this.status = U.el("button", "status drafted", "Drafted by a model");
    this.status.onclick = () => this.toggleVerified(ctx);
    stage.appendChild(this.status);

    this.card = null;
    ctx.graph.opts.onHoverNode = (n, ev) => {
      if (this.card) { this.card.remove(); this.card = null; }
      if (!n) return;
      this.card = propsCard(n);
      stage.appendChild(this.card);
      const p = ctx.graph.nodePos(n.id);
      this.card.style.left = Math.min(p.x + 24, window.innerWidth - 280) + "px";
      this.card.style.top = Math.min(p.y - 20, window.innerHeight - 220) + "px";
      gsap.fromTo(this.card, { opacity: 0, x: -8 }, { opacity: 1, x: 0, duration: 0.25 });
    };
    ctx.graph.opts.onHoverEdge = e => {
      if (!e || !e.props) { if (this.ecard) { this.ecard.remove(); this.ecard = null; } return; }
      this.ecard = propsCard({ name: e.verb, type: "edge", props: e.props });
      stage.appendChild(this.ecard);
      const s = ctx.graph.nodePos(ctx.graph._n(e.source).id), t = ctx.graph.nodePos(ctx.graph._n(e.target).id);
      this.ecard.style.left = ((s.x + t.x) / 2 + 20) + "px";
      this.ecard.style.top = ((s.y + t.y) / 2 + 20) + "px";
    };
  },
  toggleVerified(ctx) {
    const v = !ctx.graph.verified;
    ctx.graph.setVerified(v);
    this.status.textContent = v ? "Verified by a person" : "Drafted by a model";
    this.status.classList.toggle("verified", v);
    this.status.classList.toggle("drafted", !v);
    if (v) ctx.graph.edges.forEach((e, i) => setTimeout(() => ctx.graph.pulseEdge(e.id), i * 90));
  },
  step(ctx) {
    this.step_++;
    if (this.step_ === 1) { this.toggleVerified(ctx); return true; }
    if (this.step_ === 2 && ctx.variant === "generic") { ctx.variant = "ops"; this.sw.sync(); ctx.graph.setData(C.graphs.ops, { relabel: true }); return true; }
    return false;
  },
  keys(e, ctx) {
    if (e.key === "v" || e.key === "V") { this.toggleVerified(ctx); return true; }
    return false;
  },
  unmount(ctx) {
    ctx.graph.opts.onHoverNode = null; ctx.graph.opts.onHoverEdge = null;
    if (this.card) this.card.remove();
    if (this.ecard) this.ecard.remove();
  }
};

/* ---------- Scene 2: Graph RAG ---------- */
const sceneRag = {
  key: "rag",
  mount(stage, ctx) {
    ctx.showGraph(true, "left");
    ctx.graph.setVerified(true);
    ctx.graph.clearHighlights();
    this.render(stage, ctx);
  },
  data(ctx) { return ctx.variant === "ops" ? C.rag.ops : C.rag.hospital; },
  render(stage, ctx) {
    stage.querySelectorAll(".scene-head, .panel").forEach(e => e.remove());
    this.phase = 0;
    ctx.graph.setData(ctx.variant === "ops" ? C.graphs.ops : C.graphs.hospital, { relabel: true });
    ctx.graph.clearHighlights();
    this.sw = variantSwitch(ctx, "Hospital", () => this.render(stage, ctx));
    stage.appendChild(header(C.scenes[2], this.sw));

    const d = this.data(ctx);
    const panel = U.el("aside", "panel prompt-panel");
    panel.innerHTML = `
      <div class="prompt-box">
        <div class="prompt-label">Question to the model</div>
        <p class="prompt-q">${U.esc(d.question)}</p>
        <div class="prompt-label ctx-label">Facts from the graph</div>
        <ul class="ctx-list"></ul>
        <div class="example-slot"></div>
      </div>
      <div class="prompt-actions">
        <button class="btn primary ask">Ask</button>
      </div>
      <div class="answer-box"><div class="prompt-label">Answer</div><p class="answer"></p></div>`;
    stage.appendChild(panel);
    this.panel = panel;
    panel.querySelector(".ask").onclick = () => this.step(ctx);
    ctx.graph.opts.onClickNode = n => { if (n.id === d.exampleNode && this.phase === 2) this.addExample(ctx); };
    ctx.graph.markNode(d.exampleNode, true);
  },
  async ask(ctx) {
    const d = this.data(ctx);
    const list = this.panel.querySelector(".ctx-list");
    list.innerHTML = "";
    this.phase = 1;
    const token = ctx.token;
    await ctx.graph.highlightPath(d.path, { stepMs: 350 });
    for (let i = 0; i < d.path.length; i++) {
      if (token !== ctx.token) return;
      const e = ctx.graph.edges.find(x => x.id === d.path[i]);
      const s = ctx.graph.nodePos(ctx.graph._n(e.source).id), t = ctx.graph.nodePos(ctx.graph._n(e.target).id);
      await U.fly({ x: (s.x + t.x) / 2, y: (s.y + t.y) / 2 }, list, d.contextLines[i]);
    }
    if (token !== ctx.token) return;
    this.phase = 2;
    this.addExample(ctx);
  },
  addExample(ctx) {
    const d = this.data(ctx);
    const slot = this.panel.querySelector(".example-slot");
    if (slot.children.length) return;
    const token = ctx.token;
    const p = ctx.graph.nodePos(d.exampleNode);
    const chip = U.el("div", "chip-fly amber", "Verified example");
    document.body.appendChild(chip);
    chip.style.left = p.x + "px"; chip.style.top = p.y + "px";
    const sb = slot.getBoundingClientRect();
    gsap.to(chip, { left: sb.left + 16, top: sb.top + 8, duration: 0.8, ease: "power2.inOut", onComplete: () => {
      chip.remove();
      if (token !== ctx.token) return;
      const ex = U.el("div", "example", `<div class="prompt-label">Verified example from the graph</div><p>${U.esc(d.exampleText)}</p>`);
      slot.appendChild(ex);
      gsap.fromTo(ex, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.3 });
      this.phase = 3;
      this.panel.querySelector(".ask").textContent = "Answer";
    }});
  },
  answer(ctx) {
    const d = this.data(ctx);
    const el = this.panel.querySelector(".answer");
    this.phase = 4;
    this.panel.querySelector(".ask").hidden = true;
    U.type(el, d.answerWith, { cps: 70 });
  },
  step(ctx) {
    if (this.phase === 0) { this.ask(ctx); return true; }
    if (this.phase === 1 || this.phase === 2) { return true; }
    if (this.phase === 3) { this.answer(ctx); return true; }
    return false;
  },
  keys(e, ctx) {
    if (e.key === "Enter") { this.step(ctx); return true; }
    return false;
  },
  unmount(ctx) { ctx.graph.opts.onClickNode = null; ctx.graph.clearHighlights(); }
};

/* ---------- Scene 3: the graph checks the answer ---------- */
const sceneCheck = {
  key: "check",
  mount(stage, ctx) {
    ctx.showGraph(true, "left");
    ctx.graph.setVerified(true);
    this.render(stage, ctx);
  },
  data(ctx) { return ctx.variant === "ops" ? C.check.ops : C.check.bank; },
  render(stage, ctx) {
    stage.querySelectorAll(".scene-head, .panel").forEach(e => e.remove());
    this.round = 0; this.phase = 0;
    ctx.graph.setData(ctx.variant === "ops" ? C.graphs.ops : C.graphs.bank, { relabel: true });
    ctx.graph.clearHighlights();
    this.sw = variantSwitch(ctx, "Bank", () => this.render(stage, ctx));
    stage.appendChild(header(C.scenes[3], this.sw));

    const panel = U.el("aside", "panel agent-panel");
    panel.innerHTML = `
      <div class="prompt-label">${U.esc(this.data(ctx).task)}</div>
      <div class="agent-card">
        <div class="agent-name">Agent <span class="round-tag"></span></div>
        <p class="claim"></p>
        <ul class="links"></ul>
      </div>
      <div class="prompt-actions">
        <button class="btn primary check">Check against the graph</button>
      </div>
      <p class="feedback"></p>
      <div class="prompt-actions">
        <button class="btn primary retry" hidden>Give the agent this feedback</button>
      </div>`;
    stage.appendChild(panel);
    this.panel = panel;
    panel.querySelector(".check").onclick = () => this.check(ctx);
    panel.querySelector(".retry").onclick = () => this.retry(ctx);
    this.showRound(ctx);
  },
  showRound(ctx) {
    const r = this.data(ctx).rounds[this.round];
    const p = this.panel;
    p.querySelector(".round-tag").textContent = `round ${this.round + 1}`;
    p.querySelector(".claim").textContent = r.claim;
    const ul = p.querySelector(".links"); ul.innerHTML = "";
    const g = ctx.graph;
    r.links.forEach(l => {
      const s = g.nodes.find(n => n.id === l.source), t = g.nodes.find(n => n.id === l.target);
      ul.appendChild(U.el("li", "link-row", `<span class="mark"></span><b>${U.esc(s.name)}</b> <em>${U.esc(l.verb)}</em> <b>${U.esc(t.name)}</b>`));
    });
    p.querySelector(".feedback").textContent = "";
    p.querySelector(".retry").hidden = true;
    p.querySelector(".check").hidden = false;
    p.querySelector(".feedback").className = "feedback";
    ctx.graph.clearHighlights();
    this.phase = 0;
  },
  async check(ctx) {
    if (this.phase !== 0) return;
    this.phase = 1;
    const r = this.data(ctx).rounds[this.round];
    const rows = this.panel.querySelectorAll(".link-row");
    let ok = true;
    const token = ctx.token;
    for (let i = 0; i < r.links.length; i++) {
      await U.sleep(500);
      if (token !== ctx.token) return;
      const pass = ctx.graph.testLink(r.links[i]);
      rows[i].classList.add(pass ? "yes" : "no");
      if (!pass) ok = false;
    }
    await U.sleep(400);
    if (token !== ctx.token) return;
    const fb = this.panel.querySelector(".feedback");
    fb.textContent = r.feedback;
    fb.className = "feedback " + (ok ? "yes" : "no");
    this.panel.querySelector(".check").hidden = true;
    if (!ok && this.round + 1 < this.data(ctx).rounds.length) this.panel.querySelector(".retry").hidden = false;
    this.phase = ok ? 3 : 2;
  },
  retry(ctx) {
    this.round++;
    this.showRound(ctx);
    gsap.fromTo(this.panel.querySelector(".agent-card"), { x: 12, opacity: 0.4 }, { x: 0, opacity: 1, duration: 0.4 });
  },
  step(ctx) {
    if (this.phase === 0) { this.check(ctx); return true; }
    if (this.phase === 1) { return true; }
    if (this.phase === 2) { this.retry(ctx); return true; }
    return false;
  },
  keys(e, ctx) { if (e.key === "Enter") { this.step(ctx); return true; } return false; },
  unmount(ctx) { ctx.graph.clearHighlights(); }
};

/* ---------- Scene 4: where this goes next ---------- */
const sceneNext = {
  key: "next",
  mount(stage, ctx) {
    ctx.showGraph(false);
    this.sw = variantSwitch(ctx, "Hospital or bank", () => this.refreshText(ctx));
    const wrap = U.el("div", "flow");
    wrap.appendChild(header(C.scenes[4], this.sw));
    stage.appendChild(wrap);
    const grid = U.el("div", "tiles");
    this.tiles = [];
    C.next.forEach((t, i) => {
      const tile = U.el("button", "tile", `<h3>${U.esc(t.title)}</h3><p class="tile-text"></p>`);
      tile.onclick = () => this.open(stage, ctx, i);
      grid.appendChild(tile);
      this.tiles.push(tile);
    });
    wrap.appendChild(grid);
    this.refreshText(ctx);
    this.openIdx = -1;
  },
  refreshText(ctx) {
    C.next.forEach((t, i) => {
      this.tiles[i].querySelector(".tile-text").textContent = ctx.variant === "ops" ? t.ops : t.generic;
    });
    if (this.overlay) this.overlay.querySelector(".ov-text").textContent = ctx.variant === "ops" ? C.next[this.openIdx].ops : C.next[this.openIdx].generic;
  },
  open(stage, ctx, i) {
    this.close();
    this.openIdx = i;
    const t = C.next[i];
    const ov = U.el("div", "overlay");
    ov.innerHTML = `<button class="ov-close" aria-label="Close">×</button>
      <h2>${U.esc(t.title)}</h2>
      <svg class="vignette" viewBox="0 0 720 360"></svg>
      <p class="ov-text">${U.esc(ctx.variant === "ops" ? t.ops : t.generic)}</p>`;
    stage.appendChild(ov);
    this.overlay = ov;
    ov.querySelector(".ov-close").onclick = () => this.close();
    gsap.fromTo(ov, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.4 });
    this.vignette(ov.querySelector(".vignette"), t.key, ctx);
  },
  close() {
    if (this.overlay) { this.overlay.remove(); this.overlay = null; }
    if (this.vsim) { this.vsim.stop(); this.vsim = null; }
    this.openIdx = -1;
  },
  vignette(svg, key, ctx) {
    const s = d3.select(svg);
    const ops = ctx.variant === "ops";
    if (key === "subgraphs") {
      const clusters = ops ? ["Nordic Bank", "Paris DC", "Security"] : ["Pharmacy", "Oncology", "Billing"];
      const cx = [140, 360, 580];
      const nodes = [];
      clusters.forEach((c, k) => { for (let i = 0; i < 9; i++) nodes.push({ k, x: cx[k] + (Math.random() - 0.5) * 80, y: 200 + (Math.random() - 0.5) * 80 }); });
      const links = [];
      nodes.forEach((n, i) => { for (let j = i + 1; j < nodes.length; j++) if (nodes[j].k === n.k && Math.random() < 0.3) links.push({ source: i, target: j }); });
      const lk = s.append("g").selectAll("line").data(links).enter().append("line").attr("class", "v-edge");
      const nd = s.append("g").selectAll("circle").data(nodes).enter().append("circle").attr("class", d => "v-node c" + d.k).attr("r", 6);
      s.append("g").selectAll("text").data(clusters).enter().append("text").attr("class", "v-label").attr("x", (d, i) => cx[i]).attr("y", 300).attr("text-anchor", "middle").text(d => d);
      this.vsim = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).distance(28))
        .force("charge", d3.forceManyBody().strength(-40))
        .force("x", d3.forceX(d => cx[d.k]).strength(0.3))
        .force("y", d3.forceY(200).strength(0.3))
        .on("tick", () => {
          lk.attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
          nd.attr("cx", d => d.x).attr("cy", d => d.y);
        });
      const q = s.append("g").attr("class", "v-question").attr("transform", "translate(360,30)");
      q.append("rect").attr("x", -150).attr("y", -18).attr("width", 300).attr("height", 36).attr("rx", 18);
      q.append("text").attr("text-anchor", "middle").attr("dy", "0.35em").text(ops ? "Why is Nordic Bank's API failing?" : "Can she take amoxicillin?");
      const target = 0;
      gsap.to({}, { duration: 0.1, delay: 1, onComplete: () => {
        gsap.to(q.node(), { attr: { transform: `translate(${cx[target]},95)` }, duration: 0.9, ease: "power2.inOut" });
        setTimeout(() => {
          nd.filter(d => d.k === target).transition().duration(600).attr("r", 10).attr("class", "v-node c0 lit");
          nd.filter(d => d.k !== target).transition().duration(600).style("opacity", 0.25);
          lk.transition().duration(600).style("opacity", d => d.source.k === target ? 1 : 0.2);
          this.vsim.force("x", d3.forceX(d => d.k === target ? cx[d.k] : cx[d.k] + 60).strength(0.3)).force("collide", d3.forceCollide(d => d.k === target ? 22 : 6)).alpha(0.8).restart();
        }, 900);
      }});
    }
    if (key === "failure") {
      const chain = ops
        ? ["TLS upgrade CHG-2210", "Handshake fails on app-node-12", "Payment API times out", "Roll back the library"]
        : ["Batch job overruns", "Ledger locks at 00:05", "Card payments decline", "Move the batch to 02:00"];
      const kinds = ["Trigger", "Fault", "Symptom", "Fix"];
      const xs = [90, 270, 450, 630];
      const g = s.append("g");
      chain.forEach((c, i) => {
        const n = g.append("g").attr("transform", `translate(${xs[i]},180)`).style("opacity", 0);
        n.append("circle").attr("r", 28).attr("class", "v-big " + (i === 3 ? "fix" : i === 1 ? "bad" : ""));
        n.append("text").attr("class", "v-kind").attr("text-anchor", "middle").attr("dy", -44).text(kinds[i]);
        const t = n.append("text").attr("class", "v-label").attr("text-anchor", "middle").attr("dy", 56);
        c.split(" ").reduce((acc, w) => { const l = acc[acc.length - 1]; if ((l + " " + w).length > 16) acc.push(w); else acc[acc.length - 1] = (l + " " + w).trim(); return acc; }, [""]).forEach((line, j) => t.append("tspan").attr("x", 0).attr("dy", j ? 16 : 0).text(line));
        gsap.to(n.node(), { opacity: 1, duration: 0.5, delay: 0.3 + i * 0.7 });
        if (i < 3) {
          const p = g.append("path").attr("class", "v-arrow").attr("d", `M${xs[i] + 32},180 L${xs[i + 1] - 34},180`);
          const len = p.node().getTotalLength();
          p.attr("stroke-dasharray", len).attr("stroke-dashoffset", len);
          gsap.to(p.node(), { attr: { "stroke-dashoffset": 0 }, duration: 0.6, delay: 0.7 + i * 0.7, ease: "power2.out" });
        }
      });
    }
    if (key === "tacit") {
      const left = ops ? ["Client X firewall", "rejects header X-Trace", "Only Marc knows"] : ["Dr Roux", "no scripts on Fridays", "Only the ward nurse knows"];
      const g = s.append("g");
      g.append("rect").attr("x", 30).attr("y", 60).attr("width", 260).attr("height", 240).attr("rx", 16).attr("class", "v-silo");
      g.append("rect").attr("x", 430).attr("y", 60).attr("width", 260).attr("height", 240).attr("rx", 16).attr("class", "v-silo");
      g.append("text").attr("class", "v-kind").attr("x", 160).attr("y", 90).attr("text-anchor", "middle").text(ops ? "Marc's head" : "The nurse's head");
      g.append("text").attr("class", "v-kind").attr("x", 560).attr("y", 90).attr("text-anchor", "middle").text(ops ? "The next engineer" : "The next shift");
      g.append("text").attr("class", "v-kind").attr("x", 360).attr("y", 90).attr("text-anchor", "middle").text("Shared graph");
      const a = g.append("g").attr("transform", "translate(110,190)");
      a.append("circle").attr("r", 14).attr("class", "v-big");
      a.append("text").attr("class", "v-label").attr("text-anchor", "middle").attr("dy", 34).text(left[0]);
      const b = g.append("g").attr("transform", "translate(610,190)").style("opacity", 0.35);
      b.append("circle").attr("r", 14).attr("class", "v-big");
      b.append("text").attr("class", "v-label").attr("text-anchor", "middle").attr("dy", 34).text("?");
      const hint = g.append("text").attr("class", "v-label").attr("x", 160).attr("y", 270).attr("text-anchor", "middle").text(left[2]);
      const btn = g.append("g").attr("class", "v-btn").attr("transform", "translate(360,190)").style("cursor", "pointer");
      btn.append("rect").attr("x", -70).attr("y", -18).attr("width", 140).attr("height", 36).attr("rx", 18);
      btn.append("text").attr("text-anchor", "middle").attr("dy", "0.35em").text("Write it as an edge");
      btn.on("click", () => {
        btn.remove(); hint.remove();
        gsap.to(a.node(), { attr: { transform: "translate(260,190)" }, duration: 0.8, ease: "power2.inOut" });
        const p = g.append("path").attr("class", "v-arrow lit").attr("d", "M275,190 L445,190").style("opacity", 0);
        const lab = g.append("text").attr("class", "v-verb").attr("x", 360).attr("y", 178).attr("text-anchor", "middle").text(left[1]).style("opacity", 0);
        gsap.to([p.node(), lab.node()], { opacity: 1, duration: 0.5, delay: 0.8 });
        gsap.to(b.node(), { opacity: 1, duration: 0.5, delay: 1.2 });
        setTimeout(() => b.select("text").text("Now knows too"), 1200);
        gsap.to(b.node(), { attr: { transform: "translate(460,190)" }, duration: 0.8, delay: 1.2, ease: "power2.inOut" });
      });
    }
    if (key === "api") {
      const g = s.append("g");
      const box = g.append("g").attr("transform", "translate(360,180)");
      box.append("rect").attr("x", -110).attr("y", -70).attr("width", 220).attr("height", 140).attr("rx", 18).attr("class", "v-api");
      const pts = [[-60, -30], [0, -40], [60, -20], [-40, 30], [30, 35], [-10, 0]];
      pts.forEach((p, i) => { if (i) box.append("line").attr("class", "v-edge").attr("x1", pts[i - 1][0]).attr("y1", pts[i - 1][1]).attr("x2", p[0]).attr("y2", p[1]); });
      pts.forEach(p => box.append("circle").attr("class", "v-node c1").attr("r", 5).attr("cx", p[0]).attr("cy", p[1]));
      box.append("text").attr("class", "v-kind").attr("text-anchor", "middle").attr("y", 92).text(ops ? "GET /graph/why?service=payment-api" : "GET /graph/why?transfer=T-88");
      const agents = [
        { x: 90, y: 80, label: ops ? "The ops agent" : "The bank's agent", q: ops ? "why is the API failing?" : "is T-88 suspicious?", a: ops ? "CHG-2210 on app-node-12" : "New account, same phone" },
        { x: 90, y: 280, label: ops ? "The client's agent" : "The fraud team's agent", q: ops ? "what depends on node-12?" : "who holds 9930?", a: ops ? "Payment API, INC-4821" : "Rowan Ltd, one month old" }
      ];
      agents.forEach((ag, i) => {
        const a = g.append("g").attr("transform", `translate(${ag.x},${ag.y})`);
        a.append("circle").attr("r", 20).attr("class", "v-big");
        a.append("text").attr("class", "v-label").attr("text-anchor", "middle").attr("dy", 38).text(ag.label);
        const path = g.append("path").attr("class", "v-arrow").attr("d", `M${ag.x + 26},${ag.y} Q220,${ag.y} 250,180`);
        const len = path.node().getTotalLength();
        path.attr("stroke-dasharray", len).attr("stroke-dashoffset", len);
        gsap.to(path.node(), { attr: { "stroke-dashoffset": 0 }, duration: 0.7, delay: 0.5 + i * 1.6 });
        const qt = g.append("text").attr("class", "v-verb").attr("x", 160).attr("y", ag.y - 10 + (i ? 30 : 0)).text(ag.q).style("opacity", 0);
        gsap.to(qt.node(), { opacity: 1, duration: 0.4, delay: 0.5 + i * 1.6 });
        const at = g.append("text").attr("class", "v-answer").attr("x", 520).attr("y", 150 + i * 40).text(ag.a).style("opacity", 0);
        const back = g.append("path").attr("class", "v-arrow lit").attr("d", `M475,180 L510,${146 + i * 40}`);
        const bl = back.node().getTotalLength();
        back.attr("stroke-dasharray", bl).attr("stroke-dashoffset", bl);
        gsap.to(back.node(), { attr: { "stroke-dashoffset": 0 }, duration: 0.4, delay: 1.3 + i * 1.6 });
        gsap.to(at.node(), { opacity: 1, duration: 0.4, delay: 1.5 + i * 1.6 });
      });
    }
  },
  step() { return false; },
  keys(e, ctx) {
    if (e.key === "Escape" && this.overlay) { this.close(); return true; }
    if (/^[1-4]$/.test(e.key)) { this.open(document.getElementById("stage"), ctx, +e.key - 1); return true; }
    return false;
  },
  unmount() { this.close(); }
};

/* ---------- Scene 5: title card for part two ---------- */
const sceneSlmTitle = {
  key: "slm-title",
  mount(stage, ctx) {
    ctx.showGraph(false);
    document.body.classList.add("part-two");
    const h = header(C.scenes[5]);
    h.classList.add("centered");
    stage.appendChild(h);
    gsap.set(h, { xPercent: -50, yPercent: -60 });
    const svg = d3.select(stage.appendChild(U.el("div", "title-art"))).append("svg").attr("viewBox", "0 0 600 200");
    const g = svg.append("g").attr("transform", "translate(300,100)");
    [3, 8, 12, 14, 20].forEach((p, i) => {
      g.append("circle").attr("class", "marble-art").attr("cx", -220 + i * 110).attr("cy", 0).attr("r", 0)
        .transition().delay(300 + i * 150).duration(700).ease(d3.easeElasticOut).attr("r", 10 + p * 1.6);
    });
  },
  step() { return false; },
  unmount() {}
};

/* ---------- Scene 6: what an SLM is ---------- */
const sceneSlm = {
  key: "slm",
  mount(stage, ctx) {
    ctx.showGraph(false);
    const flow = U.el("div", "flow");
    flow.appendChild(header(C.scenes[6]));
    stage.appendChild(flow);
    const wrap = U.el("div", "slm-wrap");
    wrap.innerHTML = `<svg class="slm-svg" viewBox="0 0 1200 560" preserveAspectRatio="xMidYMid meet"></svg><div class="model-card"></div>`;
    flow.appendChild(wrap);
    const svg = d3.select(wrap.querySelector(".slm-svg"));
    const card = wrap.querySelector(".model-card");

    /* the laptop */
    const lap = svg.append("g").attr("class", "laptop").attr("transform", "translate(160,330)");
    lap.append("rect").attr("x", -110).attr("y", -80).attr("width", 220).attr("height", 140).attr("rx", 10);
    lap.append("rect").attr("x", -100).attr("y", -70).attr("width", 200).attr("height", 120).attr("rx", 6).attr("class", "screen");
    lap.append("rect").attr("x", -140).attr("y", 62).attr("width", 280).attr("height", 12).attr("rx", 4);
    lap.append("text").attr("class", "v-kind").attr("text-anchor", "middle").attr("y", 100).text("One laptop");

    /* the axis */
    svg.append("line").attr("class", "axis").attr("x1", 320).attr("y1", 470).attr("x2", 1150).attr("y2", 470);
    svg.append("text").attr("class", "v-kind").attr("x", 320).attr("y", 500).text("3 billion");
    svg.append("text").attr("class", "v-kind").attr("x", 700).attr("y", 500).attr("text-anchor", "middle").text("20 billion");
    svg.append("text").attr("class", "v-kind").attr("x", 1150).attr("y", 500).attr("text-anchor", "end").text("hundreds of billions and more");

    /* the frontier sphere, too big for the screen */
    const dc = svg.append("g").attr("class", "datacentre").attr("transform", "translate(1180,140)").style("opacity", 0);
    dc.append("rect").attr("x", -420).attr("y", -160).attr("width", 700).attr("height", 420).attr("rx", 14);
    for (let i = 0; i < 6; i++) dc.append("rect").attr("class", "rack").attr("x", -400 + i * 50).attr("y", -140).attr("width", 34).attr("height", 380).attr("rx", 3);
    dc.append("text").attr("class", "v-kind").attr("x", -400).attr("y", -172).text("A data centre you rent by the token");
    const front = svg.append("g").attr("class", "frontier").attr("transform", "translate(1180,140)").style("cursor", "pointer");
    front.append("circle").attr("r", 230);
    front.append("text").attr("text-anchor", "end").attr("x", -250).attr("y", 8).text("Frontier model");
    front.on("click", () => {
      const f = C.models.frontier[0];
      gsap.to(dc.node(), { opacity: 1, duration: 0.8 });
      card.innerHTML = `<h3>${U.esc(f.name)}</h3><dl><dt>Size</dt><dd>${U.esc(f.size)}</dd><dt>Runs on</dt><dd>${U.esc(f.runs)}</dd><dt>Good at</dt><dd>${U.esc(f.good)}</dd></dl>`;
      card.classList.add("on");
    });

    /* the marbles */
    const xs = d3.scaleLog().domain([3, 400]).range([360, 1150]);
    const small = C.models.small.slice().sort((a, b) => a.params - b.params);
    small.forEach(d => { d.r = 10 + d.params * 1.3; d.x = xs(d.params); });
    for (let pass = 0; pass < 20; pass++) {
      for (let i = 1; i < small.length; i++) {
        const gap = small[i].x - small[i - 1].x, need = small[i].r + small[i - 1].r + 14;
        if (gap < need) { const push = (need - gap) / 2; small[i - 1].x -= push; small[i].x += push; }
      }
    }
    const ms = svg.append("g").selectAll("g.marble").data(small).enter().append("g")
      .attr("class", "marble").attr("transform", d => `translate(${d.x},${430})`).style("cursor", "pointer");
    ms.append("circle").attr("r", d => d.r);
    ms.append("text").attr("class", "v-label").attr("text-anchor", "middle").attr("dy", (d, i) => i % 2 ? -(d.r + 10) : -(d.r + 30)).text(d => d.name);
    ms.each(function (d, i) { gsap.from(this, { attr: { transform: `translate(${d.x},-40)` }, duration: 0.9, delay: 0.2 + i * 0.12, ease: "bounce.out" }); });
    let home = new Map();
    small.forEach(d => home.set(d.name, d.x));
    let inLaptop = null;
    ms.on("click", (ev, d) => {
      if (inLaptop && inLaptop !== d) gsap.to(ms.filter(m => m === inLaptop).node(), { attr: { transform: `translate(${home.get(inLaptop.name)},430)` }, duration: 0.7, ease: "power2.inOut" });
      inLaptop = d;
      gsap.to(ev.currentTarget, { attr: { transform: "translate(160,320)" }, duration: 0.9, ease: "power2.inOut" });
      card.innerHTML = `<h3>${U.esc(d.name)}</h3><dl><dt>Size</dt><dd>${d.params} billion parameters</dd><dt>Runs on</dt><dd>${U.esc(d.runs)}</dd><dt>Good at</dt><dd>${U.esc(d.good)}</dd></dl>`;
      card.classList.add("on");
      lap.select(".screen").classed("lit", true);
    });
    this.ms = ms; this.front = front;
    this.i = 0;
  },
  step() {
    const nodes = this.ms.nodes();
    if (this.i < nodes.length) { nodes[this.i++].dispatchEvent(new Event("click")); return true; }
    if (this.i === nodes.length) { this.i++; this.front.node().dispatchEvent(new Event("click")); return true; }
    return false;
  },
  unmount() {}
};

/* ---------- Scene 6: when to go small ---------- */
const sceneDecide = {
  key: "decide",
  mount(stage, ctx) {
    ctx.showGraph(false);
    const flow = U.el("div", "flow");
    flow.appendChild(header(C.scenes[7]));
    stage.appendChild(flow);
    const wrap = U.el("div", "decide-wrap");
    wrap.innerHTML = `
      <svg class="decide-svg" viewBox="0 0 900 460" preserveAspectRatio="xMidYMid meet"></svg>
      <aside class="panel decide-panel">
        <div class="sliders"></div>
        <div class="verdict"><div class="verdict-model"></div><p class="verdict-why"></p></div>
        <div class="tradeoff"><div class="prompt-label">The trade-off</div><p>${U.esc(C.decide.tradeoff)}</p></div>
      </aside>`;
    flow.appendChild(wrap);
    const svg = d3.select(wrap.querySelector(".decide-svg"));

    /* building */
    const b = svg.append("g").attr("transform", "translate(230,240)");
    b.append("path").attr("class", "building").attr("d", "M-150,150 L-150,-60 L0,-140 L150,-60 L150,150 Z");
    b.append("text").attr("class", "v-kind").attr("text-anchor", "middle").attr("y", 180).text("Your building, your hardware");
    /* cloud */
    const cl = svg.append("g").attr("transform", "translate(700,150)");
    cl.append("path").attr("class", "cloud").attr("d", "M-90,40 a40,40 0 0 1 20,-70 a55,55 0 0 1 100,-10 a45,45 0 0 1 60,50 a35,35 0 0 1 -20,60 Z");
    cl.append("text").attr("class", "v-kind").attr("text-anchor", "middle").attr("y", 110).text("Someone else's data centre");
    /* dots */
    const N = 48;
    this.dots = d3.range(N).map(i => ({ i, hx: 230 + (Math.random() - 0.5) * 220, hy: 240 + (Math.random() - 0.3) * 200, cx: 700 + (Math.random() - 0.5) * 150, cy: 150 + (Math.random() - 0.5) * 70, out: false }));
    const dots = svg.append("g").selectAll("circle").data(this.dots).enter().append("circle").attr("class", "data-dot").attr("r", 4).attr("cx", d => d.hx).attr("cy", d => d.hy);

    /* sliders */
    const sl = wrap.querySelector(".sliders");
    this.vals = {};
    C.decide.sliders.forEach(s => {
      this.vals[s.key] = 15;
      const row = U.el("div", "slider-row");
      row.innerHTML = `<label>${U.esc(s.label)}</label><div class="slider-line"><span>${U.esc(s.low)}</span><input type="range" min="0" max="100" value="15" data-key="${s.key}"><span>${U.esc(s.high)}</span></div>`;
      sl.appendChild(row);
      row.querySelector("input").oninput = ev => { this.vals[s.key] = +ev.target.value; this.update(wrap, dots); };
    });
    this.update(wrap, dots);
    this.wrap = wrap; this.dotsSel = dots; this.i = 0;
  },
  update(wrap, dots) {
    const v = this.vals;
    let model, why, share;
    const deepThinking = v.reasoning > 65;
    const secret = v.sensitivity > 55;
    if (deepThinking && !secret) {
      model = "Frontier model"; why = "Open-ended thinking on data you can afford to send out. Rent the big model."; share = 0.9;
    } else if (deepThinking && secret) {
      model = "Big model, but on your own hardware"; why = "The thinking is hard and the data must not leave. Run the largest open model your hardware allows, and keep a person in the loop."; share = 0.05;
    } else if (v.volume > 60 || v.speed > 60) {
      model = "Small model"; why = "Narrow task, high volume or tight latency. A small model on your hardware is cheaper and faster."; share = 0;
    } else if (secret) {
      model = "Small model"; why = "The task is narrow and the data is sensitive. Nothing needs to leave the building."; share = 0;
    } else {
      model = "Either works"; why = "Narrow task, public data, low volume. Start with a small model; it costs almost nothing to try."; share = 0.3;
    }
    wrap.querySelector(".verdict-model").textContent = model;
    wrap.querySelector(".verdict-why").textContent = why;
    const outCount = Math.round(share * this.dots.length);
    dots.each(function (d) {
      const shouldOut = d.i < outCount;
      if (shouldOut !== d.out) {
        d.out = shouldOut;
        gsap.to(this, { attr: { cx: shouldOut ? d.cx : d.hx, cy: shouldOut ? d.cy : d.hy }, duration: 0.9 + Math.random() * 0.5, ease: "power2.inOut", delay: Math.random() * 0.3 });
        d3.select(this).classed("out", shouldOut);
      }
    });
  },
  presets: [
    { sensitivity: 85, volume: 20, reasoning: 20, speed: 30 },
    { sensitivity: 85, volume: 80, reasoning: 20, speed: 80 },
    { sensitivity: 20, volume: 20, reasoning: 90, speed: 20 },
    { sensitivity: 85, volume: 20, reasoning: 90, speed: 20 }
  ],
  step() {
    if (this.i >= this.presets.length) return false;
    const p = this.presets[this.i++];
    this.wrap.querySelectorAll("input[type=range]").forEach(inp => {
      const k = inp.dataset.key;
      gsap.to(inp, { value: p[k], duration: 0.6, onUpdate: () => { this.vals[k] = +inp.value; }, onComplete: () => this.update(this.wrap, this.dotsSel) });
    });
    return true;
  },
  unmount() {}
};

/* ---------- Scene 7: recorded demo ---------- */
const sceneDemo = {
  key: "demo",
  mount(stage, ctx) {
    ctx.showGraph(false);
    const flow = U.el("div", "flow");
    flow.appendChild(header(C.scenes[8]));
    stage.appendChild(flow);
    const wrap = U.el("div", "demo-wrap");
    wrap.innerHTML = `
      <div class="laptop-frame">
        <video class="demo-video" src="${C.demo.videoSrc}" controls playsinline></video>
        <div class="video-missing">Recording</div>
      </div>
      <ol class="commands"></ol>`;
    flow.appendChild(wrap);
    const ol = wrap.querySelector(".commands");
    C.demo.commands.forEach(c => ol.appendChild(U.el("li", null, `<code>${U.esc(c.cmd)}</code><p>${U.esc(c.why)}</p>`)));
    const vid = wrap.querySelector("video");
    vid.onerror = () => wrap.classList.add("no-video");
    this.vid = vid;
    ctx.checkOllama();
  },
  step() {
    if (this.vid && this.vid.paused && !this.vid.error && this.vid.readyState) { this.vid.play(); return true; }
    return false;
  },
  keys(e) { if (e.key === " ") { if (this.vid.paused) this.vid.play(); else this.vid.pause(); return true; } return false; },
  unmount() { if (this.vid) this.vid.pause(); }
};

/* ---------- Scene 8: how work changes ---------- */
const sceneWork = {
  key: "work",
  mount(stage, ctx) {
    ctx.showGraph(false);
    const flow = U.el("div", "flow");
    flow.appendChild(header(C.scenes[9]));
    stage.appendChild(flow);
    const wrap = U.el("div", "work-wrap");
    wrap.innerHTML = `
      <div class="two-prompts">
        <div class="prompt-col vague">
          <div class="prompt-label">A vague prompt</div>
          <textarea class="ptext">${U.esc(C.work.vaguePrompt)}</textarea>
          <button class="btn send">Send to the small model</button>
          <div class="answer-box"><p class="answer"></p></div>
        </div>
        <div class="prompt-col narrow">
          <div class="prompt-label">A narrow task, with the graph's facts</div>
          <textarea class="ptext">${U.esc(C.work.narrowPrompt)}</textarea>
          <button class="btn primary send">Send to the small model</button>
          <div class="answer-box"><p class="answer"></p></div>
        </div>
      </div>
      <div class="pipeline"></div>`;
    flow.appendChild(wrap);
    this.wrap = wrap;
    const cols = wrap.querySelectorAll(".prompt-col");
    cols[0].querySelector(".send").onclick = () => this.send(ctx, cols[0], C.work.vagueAnswer);
    cols[1].querySelector(".send").onclick = () => this.send(ctx, cols[1], C.work.narrowAnswer);
    this.cols = cols; this.i = 0;
  },
  async send(ctx, col, scripted) {
    const out = col.querySelector(".answer");
    const prompt = col.querySelector(".ptext").value;
    if (ctx.live) {
      out.textContent = "";
      out.classList.add("typing");
      try {
        const r = await fetch("http://localhost:11434/api/generate", { method: "POST", body: JSON.stringify({ model: C.work.ollamaModel, prompt, stream: true }) });
        const reader = r.body.getReader(); const dec = new TextDecoder();
        let buf = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n"); buf = lines.pop();
          for (const l of lines) { if (!l.trim()) continue; try { out.textContent += JSON.parse(l).response || ""; } catch (e) {} }
        }
        out.classList.remove("typing");
        return;
      } catch (e) { /* fall back to the scripted answer */ }
    }
    await U.type(out, scripted, { cps: 75 });
  },
  showPipeline() {
    const p = this.wrap.querySelector(".pipeline");
    if (p.children.length) return;
    C.work.pipeline.forEach((s, i) => {
      const box = U.el("div", "pipe-box", `<h3>${U.esc(s.role)}</h3><p>${U.esc(s.does)}</p>`);
      p.appendChild(box);
      gsap.from(box, { opacity: 0, y: 16, duration: 0.5, delay: i * 0.35 });
      if (i < 2) { const a = U.el("div", "pipe-arrow", "→"); p.appendChild(a); gsap.from(a, { opacity: 0, duration: 0.4, delay: i * 0.35 + 0.25 }); }
    });
    this.wrap.classList.add("show-pipe");
  },
  step(ctx) {
    this.i++;
    if (this.i === 1) { this.send(ctx, this.cols[0], C.work.vagueAnswer); return true; }
    if (this.i === 2) { this.send(ctx, this.cols[1], C.work.narrowAnswer); return true; }
    if (this.i === 3) { this.showPipeline(); return true; }
    return false;
  },
  unmount() {}
};

/* ---------- Scene 9: questions ---------- */
const sceneClose = {
  key: "close",
  mount(stage, ctx) {
    ctx.showGraph(true, "right");
    ctx.graph.setVerified(true);
    ctx.graph.setData(C.graphs.ops, { relabel: true });
    ctx.graph.reveal(null);
    ctx.graph.resetCamera();
    const h = header(C.scenes[10]);
    h.classList.add("closing");
    stage.appendChild(h);
  },
  step() { return false; },
  unmount() {}
};

window.SCENES = [sceneOpen, sceneWhat, sceneRag, sceneCheck, sceneNext, sceneSlmTitle, sceneSlm, sceneDecide, sceneDemo, sceneWork, sceneClose];
