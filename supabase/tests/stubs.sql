-- Minimal stand-ins for the parts of a Supabase project the migrations touch. Local testing only.
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema if not exists extensions; create schema storage; create schema cron; create schema vault; create schema net;
create extension if not exists pgcrypto with schema public;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
create table cron.job (jobid serial primary key, jobname text, schedule text, command text);
create function cron.schedule(n text, s text, c text) returns int language sql as $$ insert into cron.job(jobname,schedule,command) values (n,s,c) returning jobid $$;
create function cron.alter_job(job_id int, active boolean default null) returns void language sql as $$ select $$;
create function cron.unschedule(id int) returns bool language sql as $$ delete from cron.job where jobid = id returning true $$;
create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, description text, secret text);
create function vault.create_secret(s text, n text, d text) returns uuid language sql as $$ insert into vault.secrets(name, description, secret) values (n, d, s) returning id $$;
create view vault.decrypted_secrets as select name, secret as decrypted_secret from vault.secrets union all select 'h2h_public_anon_key'::text, 'x'::text;
create function extensions.gen_random_bytes(n int) returns bytea language sql as $$ select public.gen_random_bytes(n) $$;
create function extensions.hmac(m text, k text, a text) returns bytea language sql as $$ select public.hmac(m, k, a) $$;
create function net.http_post(url text, headers jsonb default '{}', body jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as $$ select 1::bigint $$;
-- the migrations create these extensions; make them no-ops locally
create or replace function public._noop() returns void language sql as $$ select $$;
create function public.rls_auto_enable() returns event_trigger language plpgsql as $$ begin end $$;
