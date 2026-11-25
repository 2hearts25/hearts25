-- Durable packet receipts prevent a successful part from being resent in a later sweep.
alter table website_private.enrollment_applications
  add column if not exists staff_packet jsonb;

create or replace function public.enrollment_staff_packet_p2(p_id uuid, p_plan text, p_part integer, p_email_id text)
returns jsonb language plpgsql set search_path to '' as $$
declare packet jsonb;
begin
  select staff_packet into packet from website_private.enrollment_applications where id=p_id for update;
  if not found then raise exception 'packet application missing'; end if;

  if packet is null then
    packet := jsonb_build_object('plan', p_plan, 'started', now(), 'sent', '{}'::jsonb);
    update website_private.enrollment_applications set staff_packet=packet where id=p_id;
  end if;
  if packet->>'plan' is distinct from p_plan then raise exception 'packet plan changed'; end if;
  if p_email_id is not null then
    if p_part is null or p_part < 1 or p_email_id = '' then raise exception 'invalid packet receipt'; end if;
    if (packet->'sent'->>p_part::text) is not null and (packet->'sent'->>p_part::text) <> p_email_id then
      raise exception 'conflicting packet receipt';
    end if;
    packet := jsonb_set(packet, array['sent',p_part::text], to_jsonb(p_email_id));
    update website_private.enrollment_applications set staff_packet=packet where id=p_id;
  end if;
  return packet || jsonb_build_object('retry_open', (packet->>'started')::timestamptz > now() - interval '20 hours');
end $$;
revoke all on function public.enrollment_staff_packet_p2(uuid,text,integer,text) from public, anon, authenticated;
grant execute on function public.enrollment_staff_packet_p2(uuid,text,integer,text) to service_role;
