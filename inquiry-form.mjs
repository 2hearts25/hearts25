
export function inquiryForm({copy, language, kind, path, locales, escape, action, registration}) {
  const {enroll, tour, contact, name, email, phone, preferred, age, time, placeholder,
    unsure, soon, next, later, consent, submit, sending, invalid, error, limited} = copy;
  const options = (items, selected) => items.map(([value,label]) =>
    `<option value="${escape(value)}"${value === selected ? ' selected' : ''}>${escape(label)}</option>`).join('');
  const ages = ['infant-toddler','preschool','school-age'].map((value,i) => [value, locales[language].cards[i][0]]);
  const type = registration?.heading ?? {enrollment:enroll,tour,contact}[kind];
  const success = registration ? 'registration-received' : 'thank-you';
  return `<section class="inquiry" aria-labelledby="inquiry-heading">
<h2 id="inquiry-heading">${escape(type)}</h2>
<form data-inquiry data-kind="${kind}" data-endpoint="${action}" data-success="${path(language,success)}"
  data-sending="${escape(sending)}" data-invalid="${escape(invalid)}" data-error="${escape(error)}" data-limited="${escape(limited)}" method="post" action="${action}" novalidate>
<label>${escape(registration?.guardian ?? name)}<input name="name" autocomplete="name" maxlength="100" minlength="2" required dir="auto"></label>
<label>${escape(email)}<input name="email" type="email" autocomplete="email" maxlength="254" required dir="ltr"></label>
<label>${escape(registration?.phone ?? phone)}<input name="phone" type="tel" autocomplete="tel" maxlength="32"${registration ? ' required' : ''} dir="ltr"></label>
<label>${escape(preferred)}<select name="language">${options(Object.entries(locales).map(([value,t]) => [value,t.language]),language)}</select></label>
${registration ? `<label>${escape(registration.child)}<input name="childName" autocomplete="off" maxlength="100" minlength="2" required dir="auto"></label>` : ''}
${kind !== 'contact' ? `<label>${escape(age)}<select name="age" required>${options([['',placeholder],...ages,['unsure',unsure]],'')}</select></label>
<label>${escape(time)}<select name="timeframe">${options([['',placeholder],['soon',soon],['1-3-months',next],['later',later],['unsure',unsure]],'')}</select></label>` : ''}
<div hidden aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
<label class="consent"><input type="checkbox" name="consent" required><span>${escape(registration?.consent ?? consent)}</span></label>
<a href="${path(language,'privacy')}">${escape(locales[language].footer[2])}</a>
<p class="form-status" role="status" tabindex="-1" hidden></p>
<button class="button" type="submit" disabled>${escape(registration?.submit ?? submit)}</button>
</form>
</section>`;
}

