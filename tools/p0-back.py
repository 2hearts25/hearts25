
from pathlib import Path
import re
root=Path('work/site/supabase')
m=root/'migrations'
inquiry=next(m.glob('*website_inquiry*')).read_text(encoding='utf-8-sig')
child=next(m.glob('*child_registration*')).read_text(encoding='utf-8-sig')
def routine(text,name,details):
 s=text[text.index('create function'):].replace(name,name+'_p0')
 s=s.replace('p_source_fingerprint text\n)','p_source_fingerprint text, p_consent_version text'+(', p_details jsonb' if details else '')+'\n)')
 s=s.replace('source_fingerprint\n  )','source_fingerprint, consent_version'+(', intake_details' if details else '')+'\n  )')
 s=s.replace('p_source_fingerprint\n  );','p_source_fingerprint, p_consent_version'+(', p_details' if details else '')+'\n  );')
 s=s.replace('text,text,text,text,text,text,text,text)','text,text,text,text,text,text,text,text,text'+(',jsonb' if details else '')+')')
 return s
sql="""alter table website_private.inquiries add column consent_version text, add column intake_details jsonb;
alter table website_private.child_registrations add column consent_version text;
alter table website_private.inquiries drop constraint inquiries_kind_check;
alter table website_private.inquiries add constraint inquiries_kind_check check (kind in ('enrollment','tour','contact','information'));
"""
sql+=routine(inquiry,'submit_website_inquiry',True)+routine(child,'submit_child_registration',False)
(m/'20261124190000_p0_intake.sql').write_text(sql,encoding='utf-8')
f=root/'functions/website-inquiry/index.ts'
s=f.read_text(encoding='utf-8-sig')
def sub(a,b):
 global s
 assert a in s,a
 s=s.replace(a,b,1)
sub('["enrollment", "contact", "registration"]','["enrollment", "contact", "registration", "tour", "information"]')
sub('  const registering = kind === "registration";','''  const registering = kind === "registration";
  const policy = value("policyVersion");
  const p0 = policy === "1.1.0-P0";
  const information = kind === "information";
  const tour = kind === "tour";
  const questions = value("questions");
  const interests = payload.interests ?? [];
  const details = tour ? {
    start_month:value("start_month"), tour_window:value("tour_window"),
    heard_about_us:value("heard_about_us"), notes:value("notes")
  } : information ? { interests, questions } : null;
  if ((tour || information) && !p0) return reply(422,"invalid");
  if (!Array.isArray(interests) || interests.length > 8 || interests.some(item => typeof item !== "string" || !/^[0-7]$/.test(item)) ||
      questions.length > 500 || (tour && (value("notes").length > 500 ||
        value("heard_about_us").length > 100 || value("start_month").length > 7 ||
        !["","morning","afternoon","either"].includes(value("tour_window"))))) return reply(422,"invalid");''')
sub('name.length', 'name.length') if 'name.length' in s else None
sub('!validName(name) ||','!validName(name) || (tour && !phone) ||')
sub('!ages.has(age) || (time && !times.has(time))','((!information || !!age) && !ages.has(age)) || (time && !times.has(time))')
sub('const method = registering ? "submit_child_registration" : "submit_website_inquiry";','const method = (registering ? "submit_child_registration" : "submit_website_inquiry") + (p0 ? "_p0" : "");')
sub('const response = await fetch(url','''const versioned = p0 ? {p_consent_version:policy,...(!registering ? {p_details:details} : {})} : {};
    const response = await fetch(url''')
sub('...common, ...intake','...common, ...intake, ...versioned')
sub('    return reply(201, "received");','''    if (p0 && !email.toLowerCase().endsWith(".invalid")) {
      const webhookSecret = Deno.env.get("H2H_TOUR_SHARED_SECRET");
      const deliveries: Promise<unknown>[] = [];
      const send = async (to: string, subject: string, message: string) => {
        if (!resendKey) return;
        const result = await fetch("https://api.resend.com/emails", {
          method:"POST", headers:{Authorization:"Bearer "+resendKey,"Content-Type":"application/json"},
          body:JSON.stringify({from:sender,to:[to],reply_to:staff,subject,text:message}),
          signal:AbortSignal.timeout(6500),
        });
        await result.body?.cancel();
        if (!result.ok) console.warn("intake_notification_failed",result.status);
      };
      if (tour && webhookSecret) {
        deliveries.push(fetch(url+"/functions/v1/tour-request-mailer/webhook/tour-request",{
          method:"POST",headers:{"Content-Type":"application/json","x-webhook-secret":webhookSecret},
          body:JSON.stringify({form_name:"tour-request",id:crypto.randomUUID(),data:{name,email,phone,tour_window:value("tour_window"),start_month:value("start_month")}}),
          signal:AbortSignal.timeout(6500),
        }).then(async result=>{await result.body?.cancel();if(!result.ok) console.warn("tour_notification_failed",result.status);}));
      } else if (!tour) {
        deliveries.push(send(staff,registering?"New child registration":"New website inquiry","An intake was received. Review the private Supabase records for contact details."));
        if (!registering) deliveries.push(send(email,"Heart to Heart Enrichment Center","Thank you for contacting Heart to Heart Enrichment Center. Our team will follow up."));
      }
      if (deliveries.length) EdgeRuntime.waitUntil(Promise.allSettled(deliveries).then(results=>{
        if(results.some(result=>result.status==="rejected")) console.warn("intake_notification_failed");
      }));
    }
    return reply(201, "received");''')
f.write_text(s,encoding='utf-8')

