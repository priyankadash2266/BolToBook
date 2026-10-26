-- BolToBook: owner-scoped records, private files, and aggregate founder analytics.
create table public.records(owner uuid not null references auth.users(id) on delete cascade,kind text not null,id text not null,book_id text,data jsonb not null,updated timestamptz not null default now(),primary key(owner,kind,id));
create index records_book on public.records(owner,book_id);
alter table public.records enable row level security;
create policy own_records on public.records to authenticated using(owner=(select auth.uid())) with check(owner=(select auth.uid()));
grant select,insert,update,delete on public.records to authenticated;
create table public.events(id text primary key,visitor text not null,name text not null,device text not null,day date not null default current_date,created timestamptz not null default now());
create index events_visitor_day on public.events(visitor,day);
alter table public.events enable row level security;
create table public.interests(email text primary key,visitor text not null,plan text not null,price integer not null,created timestamptz not null default now());
alter table public.interests enable row level security;
revoke all on public.events,public.interests from anon,authenticated;

create function public.book_query(q text,a jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare rows jsonb; o uuid; changed integer;
begin
 o:=auth.uid();if o is null or a->>0 is distinct from o::text then raise exception 'Unauthorized';end if;
 if q like 'SELECT data FROM records WHERE owner=%' then
  if q like '%AND id=%' then select coalesce(jsonb_agg(jsonb_build_object('data',data::text)),'[]') into rows from public.records where owner=o and kind=a->>1 and id=a->>2;
  elsif q like '%AND book_id=%' then select coalesce(jsonb_agg(jsonb_build_object('data',data::text)),'[]') into rows from public.records where owner=o and kind=a->>1 and book_id=a->>2;
  else select coalesce(jsonb_agg(jsonb_build_object('data',data::text)),'[]') into rows from public.records where owner=o and kind=a->>1; end if;
  return rows;
 elsif q like 'INSERT INTO records% SELECT %' then
  perform pg_advisory_xact_lock(hashtextextended(o::text,0));
  if (select coalesce(sum((data->>'amount')::numeric),0) from public.records where owner=o and kind='credits')<(a->>7)::numeric then return '[{"changes":0}]';end if;
  insert into public.records(owner,kind,id,book_id,data,updated) values(o,a->>1,a->>2,a->>3,(a->>4)::jsonb,(a->>5)::timestamptz);return '[{"changes":1}]';
 elsif q like 'INSERT OR IGNORE INTO records%' then
  insert into public.records(owner,kind,id,book_id,data,updated) values(o,a->>1,a->>2,a->>3,(a->>4)::jsonb,(a->>5)::timestamptz) on conflict do nothing;
 elsif q like 'INSERT INTO records% ON CONFLICT%' then
  insert into public.records(owner,kind,id,book_id,data,updated) values(o,a->>1,a->>2,a->>3,(a->>4)::jsonb,(a->>5)::timestamptz) on conflict(owner,kind,id) do update set data=excluded.data,book_id=excluded.book_id,updated=excluded.updated;
 elsif q='DELETE FROM records WHERE owner=?' then delete from public.records where owner=o;
 elsif q='DELETE FROM records WHERE owner=? AND kind=? AND id=?' then delete from public.records where owner=o and kind=a->>1 and id=a->>2;
 elsif q like 'DELETE FROM records WHERE owner=? AND (book_id=%' then delete from public.records where owner=o and (book_id=a->>1 or (kind='books' and id=a->>2));
 else raise exception 'Unsupported query';end if;
 get diagnostics changed=row_count;return jsonb_build_array(jsonb_build_object('changes',changed));
end;$$;
revoke all on function public.book_query(text,jsonb) from public,anon;
grant execute on function public.book_query(text,jsonb) to authenticated;
create function public.book_batch(jobs jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j jsonb; out jsonb:='[]';begin
 if auth.uid() is null or jsonb_array_length(jobs)>5000 then raise exception 'Invalid batch';end if;
 for j in select value from jsonb_array_elements(jobs) loop out:=out||public.book_query(j->>'q',j->'a');end loop;return out;end;$$;
revoke all on function public.book_batch(jsonb) from public,anon;
grant execute on function public.book_batch(jsonb) to authenticated;

-- These narrowly scoped write-only public endpoints need privileges because visitors cannot read the tables.
create function public.capture_event(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v text:=payload->>'visitor';begin
 if v !~ '^[a-zA-Z0-9-]{12,80}$' or payload->>'id' !~ '^[a-zA-Z0-9_-]{12,150}$' or payload->>'name' not in ('visit','pricing_view','buy_click','studio_open','idea_saved','book_created','preview_created','export_created') or payload->>'device' not in ('mobile','tablet','desktop') then raise exception 'Invalid event';end if;
 perform pg_advisory_xact_lock(hashtextextended(v,1));
 if (select count(*) from public.events where visitor=v and day=current_date)>=150 then raise exception 'Rate limit';end if;
 insert into public.events(id,visitor,name,device) values(payload->>'id',v,payload->>'name',payload->>'device') on conflict do nothing;return '{"ok":true}';end;$$;
revoke all on function public.capture_event(jsonb) from public;
grant execute on function public.capture_event(jsonb) to anon,authenticated;
create function public.capture_interest(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v text:=payload->>'visitor';e text:=lower(trim(payload->>'email'));begin
 if payload->>'consent' is distinct from 'true' or v !~ '^[a-zA-Z0-9-]{12,80}$' or e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(e)>254 then raise exception 'Invalid signup';end if;
 perform pg_advisory_xact_lock(hashtextextended(v,2));
 if (select count(*) from public.interests where visitor=v and created>now()-interval '1 day')>=5 then raise exception 'Rate limit';end if;
 insert into public.interests(email,visitor,plan,price) values(e,v,'Founding Author',499) on conflict(email) do nothing;return '{"ok":true}';end;$$;
revoke all on function public.capture_interest(jsonb) from public;
grant execute on function public.capture_interest(jsonb) to anon,authenticated;
create function public.founder_report() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and lower(email)='priyankadash224@gmail.com' and email_confirmed_at is not null) then raise exception 'Founder only';end if;
 return jsonb_build_object(
 'totals',(select coalesce(jsonb_agg(t),'[]') from(select name,count(*) events,count(distinct visitor) visitors from public.events group by name)t),
 'devices',(select coalesce(jsonb_agg(t),'[]') from(select device,count(distinct visitor) visitors from public.events where name='visit' group by device)t),
 'daily',(select coalesce(jsonb_agg(t),'[]') from(select day,count(distinct visitor) filter(where name='visit') visitors,count(distinct visitor) filter(where name='buy_click') buyers from public.events where day>=current_date-29 group by day order by day)t),
 'interested',(select count(*) from public.interests),'recent',(select coalesce(jsonb_agg(t),'[]') from(select email,plan,price,created from public.interests order by created desc limit 100)t),'updated',now());end;$$;
revoke all on function public.founder_report() from public,anon;
grant execute on function public.founder_report() to authenticated;

insert into storage.buckets(id,name,public,file_size_limit) values('manuscripts','manuscripts',false,26214400) on conflict(id) do nothing;
create policy own_manuscripts on storage.objects to authenticated using(bucket_id='manuscripts' and (storage.foldername(name))[1]=(select auth.uid())::text) with check(bucket_id='manuscripts' and (storage.foldername(name))[1]=(select auth.uid())::text);
