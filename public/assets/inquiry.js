
const publicKey = "__H2H_PUBLIC_ANON_KEY__";
function readAttribution() {
  try {
    const stored = JSON.parse(sessionStorage.getItem("h2h-attribution") || "{}");
    const clean = {};
    for (const name of ["source", "medium", "campaign", "content", "term"]) {
      if (typeof stored[name] === "string" && /^[a-z0-9 _.\-+:]{1,60}$/.test(stored[name])) clean[name] = stored[name];
    }
    return clean;
  } catch { return {}; }
}
const confirmation = document.querySelector("[data-confirmation]");
if (confirmation) {
  if (sessionStorage.getItem("h2h-confirmation") === location.pathname) {
    confirmation.hidden = false;
    const refSlot = confirmation.querySelector("[data-enroll-ref]");
    if (refSlot) { try { refSlot.textContent = sessionStorage.getItem("h2h-enroll-ref") || ""; } catch { /* reference is also emailed */ } }
  } else {
    location.replace(new URL("../", location.href));
  }
}
const inquiry = document.querySelector("[data-inquiry]");
if (inquiry) {
  const { dataset, elements } = inquiry;
  const button = inquiry.querySelector("button[type=submit]");
  const status = inquiry.querySelector(".form-status");
  const originalLabel = button.textContent;
  const selectedAge = new URLSearchParams(location.search).get("age");
  if (elements.age && Array.from(elements.age.options).some(option => option.value === selectedAge)) {
    elements.age.value = selectedAge;
  }

  function message(text) {
    status.textContent = text;
    status.hidden = !text;
    if (text) status.focus();
  }

  inquiry.addEventListener("submit", async event => {
    event.preventDefault();
    for (const field of elements) {
      if (typeof field.setAttribute === "function") field.removeAttribute("aria-invalid");
    }
    const invalid = Array.from(elements).find(field =>
      field.willValidate && (!field.validity.valid || (field.required && field.type !== "checkbox" && !field.value.trim()))
    );
    if (invalid) {
      message(dataset.invalid);
      invalid.setAttribute("aria-invalid", "true");
      invalid.focus();
      return;
    }
    message("");
    button.disabled = true;
    button.textContent = dataset.sending;
    try {
      const fields = new FormData(inquiry);
      const data = Object.fromEntries(fields);
      data.interests = fields.getAll("interests");
      data.age ??= data.age_group;
      data.policyVersion = "1.1.0-P0";
      const response = await fetch(dataset.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: publicKey,
          Authorization: "Bearer " + publicKey,
        },
        body: JSON.stringify({ ...data, kind: dataset.kind, consent: elements.consent.checked, attribution: readAttribution() }),
        signal: AbortSignal.timeout(14000),
      });
      if (response.status === 201) {
        sessionStorage.setItem("h2h-confirmation", dataset.success);
        location.assign(dataset.success);
        return;
      }
      const error = response.status === 429 ? dataset.limited
        : [400, 415, 422].includes(response.status) ? dataset.invalid : dataset.error;
      message(error);
    } catch {
      message(dataset.error);
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  });
  button.disabled = false;
}


