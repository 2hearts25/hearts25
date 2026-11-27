-- Prepare periodic maintenance; activate only after the provider credential passes acceptance.
select cron.alter_job(cron.schedule('h2h-communications-sync','*/10 * * * *','select website_private.comms_sync_request_p5();'),active:=false);
