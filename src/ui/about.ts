/**
 * The About panel: what Sol is, in words. Its text is written into the HTML
 * at build time (src/seo/), so it is also what search engines read.
 */

export function installAboutPanel(): void {
  const panel = document.getElementById("about");
  const button = document.getElementById("about-button");
  const close = document.getElementById("about-close");
  const canvas = document.getElementById("canvas");
  if (!panel || !button || !close) return;

  const isOpen = () => !panel.classList.contains("hidden");
  const toggle = (open: boolean) => {
    panel.classList.toggle("hidden", !open);
    button.classList.toggle("active", open);
    button.setAttribute("aria-expanded", String(open));
    if (open) panel.scrollTop = 0;
  };

  button.addEventListener("click", () => toggle(!isOpen()));
  close.addEventListener("click", () => toggle(false));
  canvas?.addEventListener("pointerdown", () => toggle(false));
  // Capture, so Esc closes the panel without also deselecting or unfollowing.
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen()) {
      toggle(false);
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  }, { capture: true });
  // Keys typed in the panel (space to scroll) shouldn't drive the clock.
  panel.addEventListener("keydown", (event) => event.stopPropagation());
}
