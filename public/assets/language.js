
const key = "heart-to-heart-language";
const supported = new Set(["en", "es", "ar", "sw", "fr"]);
try {
  document.querySelectorAll("[data-language]").forEach(link => {
    link.addEventListener("click", () => localStorage.setItem(key, link.dataset.language));
  });
  const saved = localStorage.getItem(key);
  const home = location.pathname === "/" && !location.search && !location.hash;
  const externalEntry = !document.referrer || new URL(document.referrer).origin !== location.origin;
  if (home && externalEntry && saved && saved !== "en" && supported.has(saved)) {
    location.replace("/" + saved + "/");
  } else if (!saved && document.documentElement.lang === "en") {
    const match = navigator.languages
      .map(value => value.toLowerCase().split("-")[0])
      .find(value => supported.has(value));
    if (match && match !== "en") {
      const suggestion = document.querySelector('[data-suggest="' + match + '"]');
      if (suggestion) suggestion.hidden = false;
    }
  }
} catch {
  // Language links continue to work when browser storage is unavailable.
}


const tour = document.querySelector("[data-netlify-tour]");
if (tour) {
  const requestedAge = new URLSearchParams(location.search).get("age");
  const age = tour.elements.age_group;
  if (Array.from(age.options).some(option => option.value === requestedAge)) age.value = requestedAge;
}

const openDropdowns = () => document.querySelectorAll("details[data-dropdown][open]");

document.addEventListener("click", event => {
  for (const dropdown of openDropdowns()) {
    if (!dropdown.contains(event.target)) dropdown.open = false;
  }
});

document.addEventListener("focusin", event => {
  for (const dropdown of openDropdowns()) {
    if (!dropdown.contains(event.target)) dropdown.open = false;
  }
});

document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  for (const dropdown of openDropdowns()) {
    const hadFocus = dropdown.contains(document.activeElement);
    dropdown.open = false;
    if (hadFocus) dropdown.querySelector("summary")?.focus();
  }
});
