-- Secrets generated in Vault; never stored in source or emitted in responses.
select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'h2h_comms_scheduler_signing','Signs communications maintenance calls') where not exists(select 1 from vault.secrets where name='h2h_comms_scheduler_signing');
select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'h2h_comms_link_signing','Signs newsletter confirmation and unsubscribe links') where not exists(select 1 from vault.secrets where name='h2h_comms_link_signing');

create or replace function public.comms_link_sign_p5(p_message text) returns text language sql stable security invoker set search_path='' as $$
select encode(extensions.hmac(p_message,decrypted_secret,'sha256'),'hex') from vault.decrypted_secrets
where name='h2h_comms_link_signing' and p_message ~ '^[0-9a-f-]{36}\|(confirm|unsub)\|[0-9]{1,12}$';
$$;
revoke all on function public.comms_link_sign_p5(text) from public,anon,authenticated;
grant execute on function public.comms_link_sign_p5(text) to service_role;

create or replace function public.comms_scheduler_verify_p5(p_proof text) returns boolean language plpgsql stable security invoker set search_path='' as $$
declare stamp text; proof text; expected text;
begin
 if p_proof is null or p_proof !~ '^[0-9]{10}\.[a-f0-9]{64}$' then return false; end if;
 stamp:=split_part(p_proof,'.',1); proof:=split_part(p_proof,'.',2);
 if abs(extract(epoch from now())-stamp::bigint)>120 then return false; end if;
 select encode(extensions.hmac('h2h-sync:'||stamp,decrypted_secret,'sha256'),'hex') into expected from vault.decrypted_secrets where name='h2h_comms_scheduler_signing';
 return coalesce(expected=proof,false);
end $$;
revoke all on function public.comms_scheduler_verify_p5(text) from public,anon,authenticated;
grant execute on function public.comms_scheduler_verify_p5(text) to service_role;

create or replace function website_private.comms_sync_request_p5() returns bigint language plpgsql security invoker set search_path='' as $$
declare stamp text:=floor(extract(epoch from now()))::bigint::text; sig text; req bigint;
begin
 select encode(extensions.hmac('h2h-sync:'||stamp,decrypted_secret,'sha256'),'hex') into sig from vault.decrypted_secrets where name='h2h_comms_scheduler_signing';
 if sig is null then raise exception 'communications scheduler signing key missing'; end if;
 select net.http_post(url:='https://zebeclcvrdmisnxkwode.supabase.co/functions/v1/communications',headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',stamp||'.'||sig),body:='{"action":"sync_tick"}'::jsonb,timeout_milliseconds:=120000) into req;
 return req;
end $$;
revoke all on function website_private.comms_sync_request_p5() from public,anon,authenticated;
grant execute on function website_private.comms_sync_request_p5() to service_role;
