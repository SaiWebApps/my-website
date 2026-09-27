/* Small helpers shared by the scenes. */

const U = {
  el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  },

  /* Type text into an element, one character at a time. Returns a promise. */
  type(el, text, { cps = 55 } = {}) {
    el.textContent = "";
    el.classList.add("typing");
    return new Promise(resolve => {
      let i = 0;
      const step = () => {
        if (i >= text.length) { el.classList.remove("typing"); resolve(); return; }
        el.textContent += text[i++];
        setTimeout(step, 1000 / cps + (text[i - 1] === "." ? 120 : 0));
      };
      step();
    });
  },

  /* Fly a chip from a screen point to a target element, then append the real line there. */
  fly(fromXY, toEl, text, delay = 0) {
    return new Promise(resolve => {
      const chip = U.el("div", "chip-fly", text);
      document.body.appendChild(chip);
      const tb = toEl.getBoundingClientRect();
      chip.style.left = fromXY.x + "px";
      chip.style.top = fromXY.y + "px";
      gsap.fromTo(chip, { scale: 0.3, opacity: 0 }, {
        scale: 1, opacity: 1, duration: 0.35, delay,
        onComplete: () => {
          gsap.to(chip, {
            left: tb.left + 16, top: tb.top + toEl.children.length * 30 + 8,
            duration: 0.8, ease: "power2.inOut",
            motionPath: undefined,
            onComplete: () => {
              chip.remove();
              const line = U.el("li", "ctx-line", text);
              toEl.appendChild(line);
              gsap.fromTo(line, { x: 8, opacity: 0 }, { x: 0, opacity: 1, duration: 0.3 });
              resolve();
            }
          });
        }
      });
    });
  },

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },

  esc(s) { return String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
};

window.U = U;
