-- 트레이딩:무살 DB — Supabase 대시보드 SQL Editor에 통째로 붙여넣고 Run.
-- 여러 번 실행해도 안전하다(이미 있으면 건너뜀).
--
-- 기록(매수·매도·예수금·메모)은 `data` JSONB에 웹 형식 그대로 저장한다(src/core/types.ts).
-- 기록에 칸이 늘어도 DB 구조를 바꿀 필요가 없다. 모든 테이블은 RLS로 "본인 기록만" 읽고 쓴다.

create table if not exists public.buys (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.sells (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.cash_txs (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.journals (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- 프로필(별호·원칙) — 사용자당 한 줄.
create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  nickname text not null,
  trading_rules text not null default '',
  created_at timestamptz not null default now()
);

-- 설정(카드 순서·설정 환율·매매 기본값·경고 기준·수수료율) — 사용자당 한 줄.
create table if not exists public.settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- 본인 기록만 — 읽기·쓰기·고치기·지우기 모두.
do $$
declare t text;
begin
  foreach t in array array['buys', 'sells', 'cash_txs', 'journals', 'profiles', 'settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t
    );
  end loop;
end $$;

-- 전부 지우기 — "데이터 초기화"와 백업 가져오기가 같이 쓴다(지우기 진입점 하나).
-- security invoker: 부른 사람 권한(RLS) 그대로라 본인 기록만 지워진다.
create or replace function public.erase_journal()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from public.buys where user_id = auth.uid();
  delete from public.sells where user_id = auth.uid();
  delete from public.cash_txs where user_id = auth.uid();
  delete from public.journals where user_id = auth.uid();
end $$;

-- 백업 가져오기 — 기록을 통째로 바꾼다. 한 트랜잭션이라 중간에 실패하면 아무것도 안 바뀐다.
-- p = { buys: [...], sells: [...], cash: [...], journals: [...], profile: {...} | null, settings: {...} }
-- profile이 null이면 지금 프로필을 그대로 둔다(가져오는 동안 온보딩이 다시 뜨지 않게).
create or replace function public.replace_journal(p jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform public.erase_journal();
  insert into public.buys (id, data) select x->>'id', x from jsonb_array_elements(coalesce(p->'buys', '[]')) x;
  insert into public.sells (id, data) select x->>'id', x from jsonb_array_elements(coalesce(p->'sells', '[]')) x;
  insert into public.cash_txs (id, data) select x->>'id', x from jsonb_array_elements(coalesce(p->'cash', '[]')) x;
  insert into public.journals (id, data) select x->>'id', x from jsonb_array_elements(coalesce(p->'journals', '[]')) x;
  if jsonb_typeof(p->'profile') = 'object' then
    insert into public.profiles (nickname, trading_rules)
    values (coalesce(p->'profile'->>'nickname', ''), coalesce(p->'profile'->>'tradingRules', ''))
    on conflict (user_id) do update set nickname = excluded.nickname, trading_rules = excluded.trading_rules;
  end if;
  if jsonb_typeof(p->'settings') = 'object' then
    insert into public.settings (data) values (p->'settings')
    on conflict (user_id) do update set data = excluded.data, updated_at = now();
  end if;
end $$;

grant execute on function public.erase_journal() to authenticated;
grant execute on function public.replace_journal(jsonb) to authenticated;
revoke execute on function public.erase_journal() from anon, public;
revoke execute on function public.replace_journal(jsonb) from anon, public;
