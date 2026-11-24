
const copy = {
  en: ['Request a tour','Your name','Phone number','Email address (optional)','Child’s age group','Preferred start month','Preferred time','Morning','Afternoon','Either','How did you hear about us?','Notes (optional)','Please share only general scheduling information.','Select an option','Not sure','Send tour request'],
  es: ['Solicitar una visita','Tu nombre','Teléfono','Correo electrónico (opcional)','Edad del niño o niña','Mes de inicio preferido','Horario preferido','Por la mañana','Por la tarde','Cualquiera','¿Cómo nos conociste?','Notas (opcional)','Comparte solo información general de horarios.','Selecciona una opción','No estoy seguro','Enviar solicitud de visita'],
  ar: ['اطلب زيارة','اسمك','رقم الهاتف','البريد الإلكتروني (اختياري)','الفئة العمرية للطفل','شهر البدء المفضل','الوقت المفضل','صباحًا','بعد الظهر','أيّ وقت','كيف سمعت عنا؟','ملاحظات (اختياري)','يرجى مشاركة معلومات عامة عن المواعيد فقط.','اختر خيارًا','غير متأكد','أرسل طلب الزيارة'],
  sw: ['Omba ziara','Jina lako','Nambari ya simu','Barua pepe (si lazima)','Kundi la umri wa mtoto','Mwezi unaopendelea kuanza','Muda unaopendelea','Asubuhi','Mchana','Wakati wowote','Ulisikia kutuhusu wapi?','Maelezo (si lazima)','Toa maelezo ya jumla kuhusu ratiba tu.','Chagua jibu','Sina uhakika','Tuma ombi la ziara'],
  fr: ['Demander une visite','Votre nom','Téléphone','Adresse courriel (facultative)','Tranche d’âge de l’enfant','Mois de début souhaité','Moment souhaité','Le matin','L’après-midi','Les deux','Comment avez-vous connu le centre ?','Notes (facultatives)','Indiquez seulement des renseignements généraux sur vos disponibilités.','Choisissez une option','Je ne sais pas','Envoyer la demande'],
};

export function netlifyTourForm({language,path,locales,escape}) {
  const [title,name,phone,email,age,start,window,morning,afternoon,either,heard,notes,hint,placeholder,unsure,send] = copy[language];
  const option = (value,label) => `<option value="${value}">${escape(label)}</option>`;
  const group = ['infant-toddler','preschool','school-age'].map((value,index) => option(value,locales[language].cards[index][0])).join('');
  return `<section class="inquiry" aria-labelledby="inquiry-heading">
<h2 id="inquiry-heading">${escape(title)}</h2>
<form name="tour-request" method="post" action="${path(language,'thank-you')}" data-netlify="true" netlify-honeypot="bot-field" data-netlify-tour>
<input type="hidden" name="form-name" value="tour-request">
<div hidden aria-hidden="true"><label>Website<input name="bot-field" tabindex="-1" autocomplete="off"></label></div>
<label>${escape(name)}<input name="name" autocomplete="name" maxlength="100" minlength="2" required dir="auto"></label>
<label>${escape(phone)}<input name="phone" type="tel" autocomplete="tel" maxlength="32" required dir="ltr"></label>
<label>${escape(email)}<input name="email" type="email" autocomplete="email" maxlength="254" dir="ltr"></label>
<label>${escape(age)}<select name="age_group" required>${option('',placeholder)}${group}${option('unsure',unsure)}</select></label>
<label>${escape(start)}<input name="start_month" type="month"></label>
<label>${escape(window)}<select name="tour_window">${option('',placeholder)}${option('morning',morning)}${option('afternoon',afternoon)}${option('either',either)}</select></label>
<label>${escape(heard)}<input name="heard_about_us" maxlength="100" dir="auto"></label>
<label>${escape(notes)}<textarea name="notes" maxlength="500" rows="3" dir="auto" aria-describedby="tour-notes-hint"></textarea></label>
<p id="tour-notes-hint">${escape(hint)}</p>
<a href="${path(language,'privacy')}">${escape(locales[language].footer[2])}</a>
<button class="button" type="submit">${escape(send)}</button>
</form>
</section>`;
}

