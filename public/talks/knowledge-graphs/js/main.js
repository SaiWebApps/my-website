/* Starts the journey: one shared graph, ten scenes, presenter keys. */

(function () {
  const stage = document.getElementById("stage");
  const graphHost = document.getElementById("graph-host");
  const svg = document.getElementById("graph-svg");
  const rail = document.getElementById("rail");
  const notes = document.getElementById("notes");
  const help = document.getElementById("help");
  const map = document.getElementById("scene-map");
  const live = document.getElementById("live");

  const ctx = {
    variant: "generic",
    token: 0,
    live: false,
    graph: new LivingGraph(svg, {}),
    showGraph(on, pos) {
      graphHost.classList.toggle("hidden", !on);
      graphHost.classList.toggle("left", pos === "left");
      graphHost.classList.toggle("right", pos === "right");
      ctx.graph.opts.padTop = 60;
      setTimeout(() => ctx.graph.resize(), 50);
      setTimeout(() => ctx.graph.resize(), 950);
    },
    async checkOllama() {
      try {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 1500);
        const r = await fetch("http://localhost:11434/api/tags", { signal: ctrl.signal });
        ctx.live = r.ok;
      } catch (e) { ctx.live = false; }
      live.textContent = "Live";
      live.classList.toggle("on", ctx.live);
      live.classList.toggle("show", ctx.live);
    }
  };

  let idx = 0;
  let current = null;

  /* progress rail */
  CONTENT.scenes.forEach((s, i) => {
    const b = document.createElement("button");
    b.className = "rail-dot" + (i === 5 ? " part-gap" : "");
    b.title = s.title;
    b.onclick = () => go(i);
    rail.appendChild(b);
  });

  function go(i, dir, keepVariant) {
    if (i < 0 || i >= SCENES.length) return;
    ctx.token++;
    if (!keepVariant) ctx.variant = "generic";
    if (current) { current.unmount(ctx); }
    stage.querySelectorAll(":scope > *").forEach(e => e.remove());
    document.querySelectorAll(".chip-fly").forEach(e => e.remove());
    idx = i;
    current = SCENES[i];
    document.body.classList.toggle("part-two", i >= 5);
    gsap.fromTo(stage, { opacity: 0, x: dir === -1 ? -24 : 24 }, { opacity: 1, x: 0, duration: 0.5, ease: "power2.out" });
    current.mount(stage, ctx);
    ctx.graph.avoid(() => stage.querySelectorAll(".scene-head, .panel, .legend, .status"));
    rail.querySelectorAll(".rail-dot").forEach((d, k) => d.classList.toggle("on", k === i));
    notes.querySelector(".notes-body").textContent = CONTENT.scenes[i].notes || "";
    location.hash = "s" + i;
    map.classList.remove("open");
  }

  function next() {
    if (current.step && current.step(ctx)) return;
    go(idx + 1, 1);
  }
  function prev() { go(idx - 1, -1); }

  document.addEventListener("keydown", e => {
    if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
    if (current.keys && current.keys(e, ctx)) { e.preventDefault(); return; }
    switch (e.key) {
      case "ArrowRight": case "PageDown": e.preventDefault(); next(); break;
      case "ArrowLeft": case "PageUp": e.preventDefault(); prev(); break;
      case "s": case "S": notes.classList.toggle("open"); break;
      case "?": help.classList.toggle("open"); break;
      case "Escape": map.classList.toggle("open"); help.classList.remove("open"); break;
      case "t": case "T":
        ctx.variant = ctx.variant === "ops" ? "generic" : "ops";
        go(idx, 0, true);
        break;
      case "Home": go(0); break;
      case "End": go(SCENES.length - 1); break;
    }
  });

  /* scene map */
  CONTENT.scenes.forEach((s, i) => {
    const b = document.createElement("button");
    b.className = "map-item";
    b.innerHTML = `<span>${i + 1}</span>${s.title}`;
    b.onclick = () => go(i);
    map.querySelector(".map-list").appendChild(b);
  });
  map.querySelector(".map-close").onclick = () => map.classList.remove("open");
  help.querySelector(".help-close").onclick = () => help.classList.remove("open");
  notes.querySelector(".notes-close").onclick = () => notes.classList.remove("open");

  /* on-screen arrows for anyone without a keyboard */
  document.getElementById("nav-next").onclick = next;
  document.getElementById("nav-prev").onclick = prev;
  document.getElementById("nav-map").onclick = () => map.classList.toggle("open");

  window.addEventListener("resize", () => ctx.graph.resize());

  const start = parseInt((location.hash.match(/s(\d+)/) || [])[1] || "0", 10);
  go(isNaN(start) ? 0 : start);
})();
