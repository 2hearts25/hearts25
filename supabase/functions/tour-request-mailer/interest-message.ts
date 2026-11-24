
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;",
})[char] ?? char);

export function interestMessage(adultName: string) {
  const first = adultName.trim().split(/\s+/u)[0];
  const greeting = "Hi" + (first ? " " + first : "") + ",";
  const heading = "Thank you for your interest in Heart to Heart Enrichment Center!";
  const intro = "Finding the right childcare is an important decision, and we're excited that you're considering Heart to Heart for your family.";
  const next = "We have received your request, and a member of our team will be in touch to answer your questions, discuss your family's childcare needs and help guide you through the next steps.";
  const belief = "We believe childcare is about more than caring for children — it's about supporting the entire family.";
  const benefits = [
    ["Free childcare for eligible families", "We proudly welcome families participating in Ohio's Publicly Funded Child Care (PFCC) program."],
    ["No application fee", "Getting started is easy."],
    ["Free meals", "Provided for children in our care."],
    ["Free school transportation", "School pickup offered within 10 miles of our center, subject to route availability."],
    ["Homework assistance", "Dedicated homework time and support for school-age children."],
    ["Toddler potty training", "Encouraging independence through patient, supportive care."],
    ["Wraparound services", "Helping families navigate public benefits and access community resources."],
    ["A welcoming, multicultural community", "A nurturing environment where children and families can feel at home."],
  ];
  const closer = "More than childcare. We're here for your whole family.";
  const explore = "In the meantime, we invite you to visit hearts25.com to learn more about our programs, services and commitment to families.";
  const help = "If you have any questions or need assistance, simply reply to this email or call us at (216) 938-6771.";
  const disclaimer = "Financial assistance is subject to program eligibility, authorized coverage and applicable copayments.";
  const sign = "With warm hearts,\n\nThe Heart to Heart Team\n\nHeart to Heart Enrichment Center\n3095 W. 25th Street\nCleveland, OH 44113\n(216) 938-6771\nOperating hours: 6:00 AM – 6:00 PM\nhearts25.com";
  const text = [greeting, heading, intro, next, "What Makes Heart to Heart Special?", belief,
    benefits.map(([title,detail]) => "- " + title + " — " + detail).join("\n"), closer,
    explore, help, "We look forward to connecting with you!", sign, "Childcare that feels like home.", disclaimer].join("\n\n");
  const html = '<div lang="en" dir="ltr" style="background:#f9f2ed;padding:24px 12px;font-family:Arial,sans-serif;color:#243044;line-height:1.6"><div style="max-width:640px;margin:auto;background:#fff;border-radius:12px;overflow:hidden">' +
    '<div style="background:#f9f2ed;text-align:center;padding:24px;color:#8d3e48"><img src="https://hearts25.com/assets/welcome-hearts.png" width="96" alt="" style="display:block;width:96px;height:auto;margin:0 auto 10px"><strong style="font-size:20px">Heart to Heart</strong><br>ENRICHMENT CENTER<br><small>Childcare that feels like home.</small></div>' +
    '<div style="padding:28px"><p>' + escape(greeting) + '</p><h1 style="font-size:24px;color:#8d3e48">' + escape(heading) + '</h1><p>' + escape(intro) + '</p><p>' + escape(next) + '</p>' +
    '<h2 style="font-size:19px;color:#8d3e48">What Makes Heart to Heart Special?</h2><p>' + escape(belief) + '</p><ul>' +
    benefits.map(([title,detail]) => '<li style="margin-bottom:8px"><strong>' + escape(title) + '</strong> — ' + escape(detail) + '</li>').join("") + '</ul>' +
    '<p><strong>' + escape(closer) + '</strong></p><p>In the meantime, we invite you to visit <a href="https://hearts25.com" style="color:#8d3e48">hearts25.com</a> to learn more about our programs, services and commitment to families.</p><p>' +
    escape(help) + '</p><p>We look forward to connecting with you!</p><p>With warm hearts,<br><strong>The Heart to Heart Team</strong></p></div>' +
    '<div style="background:#f9f2ed;text-align:center;padding:24px;color:#513b40"><strong>Heart to Heart Enrichment Center</strong><br>3095 W. 25th Street<br>Cleveland, OH 44113<br><a href="tel:+12169386771" style="color:#8d3e48">(216) 938-6771</a><br>Operating hours: 6:00 AM – 6:00 PM<br><a href="https://hearts25.com" style="color:#8d3e48">hearts25.com</a><p><em>Childcare that feels like home.</em></p><p style="font-size:12px"><em>' + escape(disclaimer) + '</em></p></div></div></div>';
  return { subject: "Thanks for your interest in Heart to Heart", text, html };
}

