const key='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplYmVjbGN2cmRtaXNueGt3b2RlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU0NjEyNzQsImV4cCI6MjExMTAzNzI3NH0.Cx8emMHLTa8W8K9Q02Yrb-j9bsUrKxWuGVvWoxlDHmE';
const due = Date.parse('2026-11-25T15:01:05Z');
if (Date.now() < due) await new Promise(resolve=>setTimeout(resolve,due-Date.now()));
const response=await fetch('https://zebeclcvrdmisnxkwode.supabase.co/functions/v1/submit-enrollment/sweep',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(20000)});
if(response.status!==202) throw Error('Sweep request returned '+response.status);
console.log('Queued processing retry for the existing production smoke record.');
