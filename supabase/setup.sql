-- Run once in Supabase SQL Editor. Safe to re-run; existing data is preserved.
begin;
create table if not exists public.library_documents (
 owner_id uuid not null references auth.users(id) on delete cascade,
 key text not null check (length(key) between 1 and 200),
 payload jsonb not null,
 revision integer not null default 1 check (revision > 0),
 primary key (owner_id,key)
);
alter table public.library_documents enable row level security;
revoke all on public.library_documents from anon;
grant select,insert,update,delete on public.library_documents to authenticated;
drop policy if exists library_owner on public.library_documents;
create policy library_owner on public.library_documents for all to authenticated
 using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('library-media','library-media',false,52428800,array['image/jpeg','image/png','image/gif','image/webp','image/avif','video/mp4','video/webm','video/quicktime'])
on conflict(id) do nothing;
drop policy if exists library_media_read on storage.objects;
drop policy if exists library_media_insert on storage.objects;
drop policy if exists library_media_delete on storage.objects;
create policy library_media_read on storage.objects for select to authenticated
 using (bucket_id='library-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy library_media_insert on storage.objects for insert to authenticated
 with check (bucket_id='library-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy library_media_delete on storage.objects for delete to authenticated
 using (bucket_id='library-media' and (storage.foldername(name))[1]=(select auth.uid())::text);

create or replace function public.seed_library_demo() returns void
language plpgsql security invoker set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 insert into public.library_documents(owner_id,key,payload)
 values(auth.uid(),'library_demo_seed_v1','true'::jsonb)
 on conflict do nothing;
 if not found then return; end if;
 insert into public.library_documents(owner_id,key,payload) values(auth.uid(),'storyloom_created_novels_v1','[{"id": "demo-harbor", "title": "안개 항구의 편지", "author": "테스트 작가", "series": "항구의 이야기", "seriesIndex": "1권", "createdAt": 0}, {"id": "demo-notes", "title": "새벽의 기록", "author": "테스트 작가", "series": "", "seriesIndex": "", "createdAt": 0}]'::jsonb) on conflict do nothing;
 insert into public.library_documents(owner_id,key,payload) values(auth.uid(),'storyloom_created_series_v1','[{"id": "demo-series", "name": "항구의 이야기", "createdAt": 0}]'::jsonb) on conflict do nothing;
 insert into public.library_documents(owner_id,key,payload) values(auth.uid(),'storyloom_novel_v2_demo-harbor','{"baseYear": 2026, "description": "사라진 편지 한 장을 따라 항구 마을의 비밀을 찾아가는 더미 소설입니다.", "characters": [{"id": "c1", "name": "윤서", "baseAge": 29, "avatar": "윤"}, {"id": "c2", "name": "해준", "baseAge": 31, "avatar": "해"}], "acts": [{"id": "a1", "title": "에피소드 1", "subtitle": "도착하지 않은 편지", "chapters": [{"id": "ch1", "title": "001", "scenes": ["s1", "s2"]}]}], "scenes": {"s1": {"id": "s1", "title": "항구의 오후", "year": 2026, "time": "오후 5시", "location": "오래된 항구", "pov": "윤서", "characters": ["c1", "c2"], "goal": "서로의 단서를 비교한다.", "notes": "자유롭게 수정할 수 있는 더미 장면입니다.", "text": "오후의 항구에는 배 대신 안개가 먼저 도착했다. 윤서는 봉투에 적힌 주소를 다시 확인했다.", "bodyHtml": "", "media": []}, "s2": {"id": "s2", "title": "첫 번째 단서", "year": 2026, "time": "오후 5시", "location": "등대 관리실", "pov": "윤서", "characters": ["c1", "c2"], "goal": "서로의 단서를 비교한다.", "notes": "자유롭게 수정할 수 있는 더미 장면입니다.", "text": "해준은 접힌 지도를 책상 위에 펼쳤다. 붉은 동그라미는 이미 사라진 등대를 가리키고 있었다.", "bodyHtml": "", "media": []}}, "snippets": "이 작품은 연결 확인용 더미데이터입니다.", "others": [{"name": "붉은 봉투", "detail": "발신인이 적혀 있지 않은 편지"}]}'::jsonb) on conflict do nothing;
 insert into public.library_documents(owner_id,key,payload) values(auth.uid(),'storyloom_novel_v2_demo-notes','{"baseYear": 2026, "description": "짧은 이야기를 연습하는 두 번째 더미 작품입니다.", "characters": [], "acts": [{"id": "a1", "title": "에피소드 1", "subtitle": "시작", "chapters": [{"id": "ch1", "title": "001", "scenes": ["s1"]}]}], "scenes": {"s1": {"id": "s1", "title": "새벽의 기록", "year": 2026, "time": "오후 5시", "location": "작업실", "pov": "", "characters": [], "goal": "서로의 단서를 비교한다.", "notes": "자유롭게 수정할 수 있는 더미 장면입니다.", "text": "창문을 열자 비가 멎어 있었다. 오늘은 어제와 다른 문장을 쓰기로 했다.", "bodyHtml": "", "media": []}}, "snippets": ""}'::jsonb) on conflict do nothing;
end;
$$;
revoke all on function public.seed_library_demo() from public,anon;
grant execute on function public.seed_library_demo() to authenticated;
commit;
