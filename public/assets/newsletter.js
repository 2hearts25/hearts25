const newsletterEndpoint = "https://zebeclcvrdmisnxkwode.supabase.co/functions/v1/communications";
const newsletterForm = document.querySelector("[data-newsletter]");
if (newsletterForm) {
  const form = newsletterForm;
  const status = form.querySelector(".form-status"), button = form.querySelector("button");
  const say = text => { status.textContent = text; status.hidden = !text; if (text) status.focus(); };
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const email = form.elements.email;
    email.removeAttribute("aria-invalid");
    if (!email.value.trim() || !email.validity.valid) { email.setAttribute("aria-invalid", "true"); say(form.dataset.invalid); email.focus(); return; }
    say(""); button.disabled = true;
    try {
      const response = await fetch(newsletterEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(14000),
        body: JSON.stringify({ action: "subscribe", email: email.value.trim(), name: form.elements.name.value.trim(), website: form.elements.website.value, language: form.dataset.lang, source: "footer" }) });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.disabled) say(form.dataset.unavailable);
      else if (response.ok) { say(form.dataset.sent); form.reset(); }
      else say(response.status === 429 ? form.dataset.limited : response.status === 422 ? form.dataset.invalid : form.dataset.error);
    } catch { say(form.dataset.error); } finally { button.disabled = false; }
  });
}
