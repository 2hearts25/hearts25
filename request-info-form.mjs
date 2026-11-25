// Standalone "Request More Information" form markup (v1.2.0). Posts through the existing inquiry pipeline (kind=information).
export function requestInfoForm({ copy, ui, language, path, locales, escape, action }) {
  const options = items => items.map(([value, label, selected]) => `<option value="${escape(value)}"${selected ? ' selected' : ''}>${escape(label)}</option>`).join('');
  const ages = ['infant-toddler', 'preschool', 'school-age'].map((value, i) => [value, locales[language].cards[i][0]]);
  const languages = Object.entries(locales).map(([value, t]) => [value, t.language, value === language]);
  const methods = ['email', 'phone', 'text', 'none'].map((value, i) => [value, ui.contactOptions[i]]);
  return `<section class="inquiry" aria-labelledby="inquiry-heading">
<h2 id="inquiry-heading">${escape(copy.type)}</h2>
<form data-inquiry data-kind="information" data-endpoint="${action}" data-success="${path(language, 'information-received')}"
  data-sending="${escape(copy.sending)}" data-invalid="${escape(copy.invalid)}" data-error="${escape(copy.error)}" data-limited="${escape(copy.limited)}" method="post" action="${action}" novalidate>
<label>${escape(ui.name)} *<input name="name" autocomplete="name" maxlength="100" minlength="2" required dir="auto"></label>
<label>${escape(ui.email)} *<input name="email" type="email" autocomplete="email" maxlength="254" required dir="ltr"></label>
<label>${escape(ui.phone)}<input name="phone" type="tel" autocomplete="tel" maxlength="32" dir="ltr"></label>
<label>${escape(ui.age)}<select name="age">${options([['', copy.placeholder], ...ages, ['unsure', copy.unsure]])}</select></label>
<label>${escape(ui.language)}<select name="language">${options(languages)}</select></label>
<label>${escape(ui.contact)}<select name="contactMethod">${options([['', copy.placeholder], ...methods])}</select></label>
<fieldset><legend>${escape(ui.interestsLegend)}</legend>${ui.interests.map((label, index) => `<label class="consent"><input type="checkbox" name="interests" value="${index}">${escape(label)}</label>`).join('')}</fieldset>
<label>${escape(ui.questions)}<textarea name="questions" maxlength="500" rows="4" dir="auto"></textarea></label>
<p class="help">${escape(ui.privacyNote)}</p>
<div hidden aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
<label class="consent"><input type="checkbox" name="consent" required><span>${escape(copy.consent)} *</span></label>
<a href="${path(language, 'privacy')}">${escape(locales[language].footer[2])}</a>
<p class="form-status" role="status" tabindex="-1" hidden></p>
<button class="button" type="submit" disabled>${escape(copy.submit)}</button>
</form>
</section>`;
}
