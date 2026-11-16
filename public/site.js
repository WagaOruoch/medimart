const siteState = {};
function setWordmark(target, name) {
  target.replaceChildren();
  const bold = document.createElement("span");
  bold.className = "wordmark-bold";
  bold.textContent = name.slice(0, 4);
  const regular = document.createElement("span");
  regular.className = "wordmark-regular";
  regular.textContent = name.slice(4);
  target.append(bold, regular);
}
async function loadSiteBranding() {
  siteState.config = await fetch("/api/config").then((response) => response.json());
  document.documentElement.style.setProperty("--primary", siteState.config.primary);
  const target = document.querySelector("[data-brand-name]");
  if (target) setWordmark(target, siteState.config.name);
  document.querySelectorAll("[data-tagline]").forEach((element) => {
    element.textContent = siteState.config.tagline;
  });
  document.title = `${siteState.config.name} | Online Pharmacy`;
}
loadSiteBranding();
