
const publicKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplYmVjbGN2cmRtaXNueGt3b2RlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU0NjEyNzQsImV4cCI6MjExMTAzNzI3NH0.Cx8emMHLTa8W8K9Q02Yrb-j9bsUrKxWuGVvWoxlDHmE";
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
      const data = Object.fromEntries(new FormData(inquiry));
      const response = await fetch(dataset.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: publicKey,
          Authorization: "Bearer " + publicKey,
        },
        body: JSON.stringify({ ...data, kind: dataset.kind, consent: elements.consent.checked }),
        signal: AbortSignal.timeout(14000),
      });
      if (response.status === 201) {
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

