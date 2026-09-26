export function mountLeadership(root: HTMLElement) {
  const controls = [...root.querySelectorAll<SVGGElement>('.lead-hub, .lead-spoke, .lead-link')];
  const links = [...root.querySelectorAll<SVGGElement>('.lead-link')];
  const items = [...root.querySelectorAll<HTMLElement>('.lead-list li')];
  let active: { spoke?: string; hub?: string } | null = null;

  const matches = (el: HTMLElement | SVGElement) =>
    !active || ((!active.spoke || el.dataset.spoke === active.spoke) && (!active.hub || el.dataset.hub === active.hub));

  function apply() {
    root.classList.toggle('has-filter', Boolean(active));
    items.forEach(item => { item.hidden = !matches(item); });
    links.forEach(link => link.classList.toggle('is-on', Boolean(active) && matches(link)));
    controls.forEach(control => {
      const same = Boolean(active) && control.dataset.spoke === active!.spoke && control.dataset.hub === active!.hub;
      control.setAttribute('aria-pressed', String(same));
      const touched = Boolean(active) && (
        (control.classList.contains('lead-hub') && links.some(link => link.classList.contains('is-on') && link.dataset.hub === control.dataset.hub)) ||
        (control.classList.contains('lead-spoke') && links.some(link => link.classList.contains('is-on') && link.dataset.spoke === control.dataset.spoke)));
      control.classList.toggle('is-on', same || touched);
    });
  }

  function toggle(control: SVGGElement) {
    const next = { spoke: control.dataset.spoke, hub: control.dataset.hub };
    active = active && active.spoke === next.spoke && active.hub === next.hub ? null : next;
    apply();
  }

  controls.forEach(control => {
    control.addEventListener('click', () => toggle(control));
    control.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      toggle(control);
    });
  });
}
