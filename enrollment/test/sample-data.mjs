// Fully synthetic data. No real person, address or number.
export const sample = {
  'c.first': 'Amira', 'c.last': 'Okonkwo-Test', 'c.nick': 'Mimi', 'c.dob': '2022-06-14', 'c.addr': '1234 Example Avenue Apt 5', 'c.city': 'Cleveland', 'c.state': 'OH', 'c.zip': '44113', 'c.phone': '(216) 555-0142',
  'c.start': '2027-01-11', 'c.program': 'preschool', 'c.days': ['mon', 'tue', 'wed', 'thu', 'fri'], 'c.from': '07:30', 'c.to': '16:30', 'c.schedule': 'full', 'c.payment': 'pfcc',
  'c.schoolTransport': 'yes', 'c.school': 'Example Elementary School', 'c.grade': 'Pre-K', 'c.commLang': 'ar',
  'p1.name': 'فاطمة الأحمد (اختبار)', 'p1.rel': 'Mother', 'p1.sameAddr': true, 'p1.sameHome': false, 'p1.home': '(216) 555-0143', 'p1.cell': '(216) 555-0144', 'p1.contactPath': 'email', 'p1.email': 'parent.one@example.com',
  'p1.workNA': false, 'p1.workName': 'مستشفى المثال', 'p1.workAddr': '500 Sample Road', 'p1.workCity': 'Cleveland', 'p1.workPhone': '(216) 555-0145', 'p1.reach': 'Cell phone, best after 5pm — رقم الهاتف 216-555-0144', 'p1.share': 'yes', 'p1.shareWhat': ['cell', 'email'],
  'p2.has': 'yes', 'p2.name': 'Samuel Okonkwo-Test', 'p2.rel': 'Father', 'p2.sameAddr': false, 'p2.addr': '88 Other Street', 'p2.city': 'Lakewood', 'p2.state': 'OH', 'p2.zip': '44107', 'p2.sameHome': false, 'p2.home': '', 'p2.cell': '(216) 555-0146', 'p2.contactPath': 'phone', 'p2.workNA': true, 'p2.reach': 'Cell', 'p2.share': 'no',
  ec: [
    { name: 'Grace Aunt-Test', rel: 'Aunt', city: 'Parma', state: 'OH', phone: '(216) 555-0147', other: '(216) 555-0148', adult: 'yes', canResp: 'yes', release: 'yes' },
    { name: 'José Núñez-Test', rel: 'Family friend', city: 'Cleveland', state: 'OH', phone: '(216) 555-0149', adult: 'yes', canResp: 'yes', release: 'no' },
  ],
  'pu.has': 'yes', pu: [{ name: 'Grace Aunt-Test', rel: 'Aunt', phone: '(216) 555-0147' }, { name: 'Neema Mwangi-Test', rel: 'Neighbor', phone: '(216) 555-0150' }], 'pu.idAck': true, 'pu.restrict': 'yes', 'pu.restrictText': 'Synthetic example: a named person is not permitted. Staff to call the director for the court order details.',
  'h.provNone': false, 'h.provName': 'Dr. Example Pediatrics', 'h.provAddr': '1 Clinic Way', 'h.provCity': 'Cleveland', 'h.provState': 'OH', 'h.provPhone': '(216) 555-0151',
  'h.allergy': 'yes', 'h.allergyTypes': ['food', 'environmental'], 'h.allergyDesc': 'Peanut allergy (synthetic) causing hives and swelling. Seasonal pollen allergy causing sneezing.', 'h.allergyAction': 'yes',
  'h.chronic': 'yes', 'h.chronicNeeds': ['monitor', 'medication'], 'h.chronicDesc': 'Mild asthma (synthetic example) — wheezes with colds or heavy exercise.', 'h.devDelay': 'no',
  'h.meds': 'yes', 'h.medsDesc': 'Example inhaler, 2 puffs when wheezing, as directed by the provider.', 'h.medsAtCare': 'yes',
  'h.diet': 'yes', 'h.dietDesc': 'No peanuts or tree nuts.', 'h.dietModified': 'yes', 'h.avoid': 'Peanuts, tree nuts, latex gloves', 'h.history': 'Ear infection at age 2. No surgeries.', 'h.other': 'N/A', 'h.accom': 'N/A', 'h.services': 'no',
  'd.immun': 'medical', 'd.hcp': 'pending', 'd.diet': 'available', 'd.med': 'pending',
  'f.immediate': 'Mother, father and older brother (age 7).', 'f.household': 'Maternal grandmother lives in the home.', 'f.homeLang': 'Arabic, English', 'f.arrangements': 'Both parents share custody and live together.', 'f.changes': 'Moved to a new home in the spring.', 'f.cultural': 'We do not eat pork. We celebrate Eid.', 'f.pets': 'One cat', 'f.prevCare': 'no',
  'pe.traits': ['curious', 'friendly', 'sensitive', 'other'], 'pe.traitsOther': 'loves music', 'pe.more': 'Amira loves drawing and singing and warms up slowly in new groups.', 'pe.fears': 'Loud vacuum cleaners', 'pe.comfort': 'A stuffed rabbit and quiet songs', 'pe.frustration': 'Goes quiet and then cries', 'pe.negBehavior': 'We calmly name the feeling and offer a choice.',
  'pe.devInfo': 'Speaks in full sentences in Arabic and English.', 'pe.routines': 'Story time before bed.', 'pe.anxious': 'Separation in the morning', 'pe.excited': 'Painting and playing outside', 'pe.expect': 'A caring place where she learns and makes friends', 'pe.helpful': 'Please greet her in Arabic: صباح الخير',
  'fe.drinks': ['milk', 'water'], 'fe.amount': 'Eats small portions often and drinks about 6 cups of water.', 'fe.fav': 'Rice, chicken, mango', 'fe.dislike': 'Mushrooms', 'fe.noFeed': 'Anything with peanuts or pork', 'fe.seat': 'child',
  'sl.bed': '8:00 PM', 'sl.wake': '6:30 AM', 'sl.nap': 'One nap after lunch, about 1.5 hours', 'sl.trouble': 'Sometimes asks for light on', 'sl.mood': 'Cheerful', 'sl.comfort': 'Stuffed rabbit',
  'po.trained': 'learning', 'po.method': 'Sits every two hours with a reward chart.', 'po.assist': 'Needs help with buttons', 'po.signs': 'Holds herself and goes quiet', 'po.diaperAck': true, 'po.care': 'Please use fragrance-free wipes (synthetic instruction).', 'et.choice': 'give',
  'st.school': 'Example Elementary School', 'st.addr': '700 School Street, Cleveland, OH 44113', 'st.teacher': 'Ms. Example', 'st.room': '12', 'st.arrive': '08:30', 'st.depart': '15:15', 'st.days': ['mon', 'tue', 'wed', 'thu', 'fri'], 'st.when': 'both', 'st.exit': 'Main front doors', 'st.phone': '(216) 555-0144', 'st.parentName': 'فاطمة الأحمد (اختبار)', 'st.parentPhone': '(216) 555-0144',
  'ag.contractAck': true, 'ag.absenceAck': true, 'ag.handbook': 'pending', 'ag.resCommunity': 'received', 'ag.transIn': 'received', 'ag.transWithin': 'pending', 'ag.transOut': 'pending',
  'm.internal': 'yes', 'm.marketing': 'no',
};

// 1.3.0-E2 additions (synthetic). Upload ids are placeholders; real ids are issued by the server per upload session.
export const SAMPLE_DOC_IDS = { immun: '0b1c2d3e-4f50-4617-8899-aabbccddee01', insFront: '0b1c2d3e-4f50-4617-8899-aabbccddee02', custody: '0b1c2d3e-4f50-4617-8899-aabbccddee03' };
export const sample130 = {
  ...sample,
  'ins.status': 'medicaid', 'ins.plan': 'Example Medicaid Plan (synthetic)', 'ins.member': 'SYN-0000-1234', 'ins.holder': 'فاطمة الأحمد (اختبار)', 'ins.holderRel': 'Mother',
  'up.insFront': [SAMPLE_DOC_IDS.insFront], 'up.immun': [SAMPLE_DOC_IDS.immun], 'up.custody': [SAMPLE_DOC_IDS.custody], 'd.separate': true,
  'lp.ack': true, 'fin.choice': 'skip', 'fin.notice': 'continued', 'ag.wt': 'ack', 'pf.auth': 'pending', 'pf.copay': 'amount', 'pf.copayAmt': '12.50', 'pf.dueDay': 'fri', 'pf.ack': true,
};
export const sampleDocs130 = [
  { id: SAMPLE_DOC_IDS.immun, category: 'immunization', mime: 'application/pdf', bytes: 81234, sha256: 'a'.repeat(64) },
  { id: SAMPLE_DOC_IDS.insFront, category: 'insurance-front', mime: 'image/jpeg', bytes: 512000, sha256: 'b'.repeat(64) },
  { id: SAMPLE_DOC_IDS.custody, category: 'custody', mime: 'application/pdf', bytes: 120000, sha256: 'c'.repeat(64) },
];
