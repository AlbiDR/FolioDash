// Source for the isolated, generated design study. Not imported by the application.
export const STUDY_JS = String.raw`// Presentation-only study: no storage, network access or financial calculations.
const privacy = document.querySelector("#privacy");
const amounts = [...document.querySelectorAll(".sensitive")].map((element) => ({
  element,
  original: element.innerHTML,
}));
privacy.addEventListener("click", () => {
  const hidden = privacy.getAttribute("aria-pressed") !== "true";
  // Replace the content immediately, including the accessible chart and open values table.
  amounts.forEach(({ element, original }) => {
    element.innerHTML = hidden ? "••••" : original;
  });
  document.querySelectorAll(".chart-sensitive").forEach((element) => {
    element.hidden = hidden;
  });
  document.querySelector(".chart-hidden").hidden = !hidden;
  privacy.setAttribute("aria-pressed", String(hidden));
  privacy.textContent = hidden ? "Show figures" : "Hide figures";
  document.querySelector("#privacy-status").textContent = hidden
    ? "Figures and charts hidden."
    : "Synthetic figures shown.";
});

const sections = [...document.querySelectorAll("main[id], main section[id]")];
const links = [...document.querySelectorAll(".sidebar nav a, .mobile-nav a")];
const updateNavigation = () => {
  const current = sections.findLast((section) => section.getBoundingClientRect().top <= innerHeight / 3) ?? sections[0];
  links.forEach((link) => {
    const active = link.hash === "#" + current.id;
    link.classList.toggle("selected", active);
    if (active) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
};
addEventListener("scroll", updateNavigation, { passive: true });
updateNavigation();

document.documentElement.dataset.studyReady = "true";
`;
