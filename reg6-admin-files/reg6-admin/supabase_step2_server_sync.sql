-- =====================================================================
--  ขั้นที่ 2: ให้เซิร์ฟเวอร์เว็บดึงข้อมูลจาก Supabase เองได้ (รันหลัง supabase_schema.sql)
--  Supabase Dashboard > SQL Editor > New query > วางทั้งไฟล์ > Run  (รันซ้ำได้)
--
--  ทำ 2 อย่าง
--   1) เปิดสิทธิ์ "อ่านอย่างเดียว" ให้ผู้ใช้ทั่วไป (anon) เฉพาะข้อมูลที่แสดงบนเว็บสาธารณะอยู่แล้ว
--      (ข่าว/หนังสือเวียนที่ติ๊ก "แสดง", ส่วนงาน, ระบบ/คู่มือ, เบอร์โทร, Dashboard)
--      การเพิ่ม/แก้/ลบ ยังทำได้เฉพาะผู้ดูแลเหมือนเดิม
--   2) สร้างฟังก์ชัน site_content_js() ให้ฐานข้อมูลสร้างไฟล์ content.js สำเร็จรูปส่งกลับมา
--      สคริปต์บน Windows Server 2008 จึงแค่ดาวน์โหลดแล้วบันทึกเป็นไฟล์ ไม่ต้องแกะ JSON
-- =====================================================================

-- ---------- 1) สิทธิ์อ่านสาธารณะ (anon) ----------
grant usage on schema public to anon;
grant select on public.dept, public.doc_type, public.news_category, public.news, public.circular,
                public.circular_file, public.hub_section, public.hub_item, public.phone_directory,
                public.dashboard to anon;

drop policy if exists "public read" on public.dept;
create policy "public read" on public.dept for select to anon using (true);
drop policy if exists "public read" on public.doc_type;
create policy "public read" on public.doc_type for select to anon using (true);
drop policy if exists "public read" on public.news_category;
create policy "public read" on public.news_category for select to anon using (true);
drop policy if exists "public read" on public.hub_section;
create policy "public read" on public.hub_section for select to anon using (true);
drop policy if exists "public read" on public.hub_item;
create policy "public read" on public.hub_item for select to anon using (true);
drop policy if exists "public read" on public.phone_directory;
create policy "public read" on public.phone_directory for select to anon using (true);
drop policy if exists "public read" on public.dashboard;
create policy "public read" on public.dashboard for select to anon using (true);

drop policy if exists "public read" on public.news;
create policy "public read" on public.news for select to anon using (is_published);
drop policy if exists "public read" on public.circular;
create policy "public read" on public.circular for select to anon using (is_published);
drop policy if exists "public read" on public.circular_file;
create policy "public read" on public.circular_file for select to anon
  using (exists (select 1 from public.circular c where c.circular_id = circular_file.circular_id and c.is_published));

-- ---------- 2) ฟังก์ชันสร้าง content.js ----------
-- แปลงข้อความเป็นสตริง JavaScript ที่ปลอดภัย (escape เครื่องหมายคำพูด, </script>, U+2028/2029)
create or replace function public.js_str(t text)
returns text language sql immutable
as $$
  select replace(replace(replace(to_json(coalesce(t, ''))::text, '</', '<\/'), chr(8232), ' '), chr(8233), ' ');
$$;

-- วันที่แบบไทยย่อ เช่น 15 ม.ค. 69
create or replace function public.thai_date(d date)
returns text language sql immutable
as $$
  select extract(day from d)::int::text || ' ' ||
         (array['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'])[extract(month from d)::int] || ' ' ||
         right((extract(year from d)::int + 543)::text, 2);
$$;

create or replace function public.site_content_js()
returns text
language sql
stable
set search_path = public
as $$
select
  '/* สร้างอัตโนมัติจาก Supabase เมื่อ ' || to_char(now() at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI:SS') || ' (UTC+7) - อย่าแก้ไขไฟล์นี้ด้วยมือ */' || E'\n' ||

  'var DEPTS = [' || coalesce((select string_agg(js_str(short_name), ', ' order by sort_order, dept_id) from dept), '') || '];' || E'\n\n' ||

  'var NEWS = [' || E'\n' || coalesce((
     select string_agg('  { cat: ' || js_str(case when cat_id = 1 then 'ทั่วไป' else 'ประชาสัมพันธ์' end) ||
                       ', title: ' || js_str(title) || ', img: ' || js_str(image_file) || ', url: ' || js_str(link_url) || ' }',
                       E',\n' order by published_at desc, news_id desc)
     from news where is_published), '') || E'\n];' || E'\n\n' ||

  'var CIRCULARS = [' || E'\n' || coalesce((
     select string_agg('  { title: ' || js_str(c.title) || ', no: ' || js_str(c.doc_no) || ', type: ' || c.type_id ||
                       ', date: ' || js_str(thai_date(c.doc_date)) || ', dept: ' || js_str(d.short_name) ||
                       ', files: ' || (select count(*) from circular_file f where f.circular_id = c.circular_id and f.kind = 'file') ||
                       ', links: ' || (select count(*) from circular_file f where f.circular_id = c.circular_id and f.kind = 'link') ||
                       ', url: ' || js_str((select f.url from circular_file f where f.circular_id = c.circular_id and f.kind = 'file' order by f.file_id limit 1)) || ' }',
                       E',\n' order by c.doc_date desc, c.circular_id desc)
     from circular c join dept d on d.dept_id = c.dept_id where c.is_published), '') || E'\n];' || E'\n\n' ||

  'var HUB = [' || E'\n' || coalesce((
     select string_agg('  { name: ' || js_str(s.name) || ', desc: ' || js_str(s.description) || ', items: [' ||
                       coalesce((select string_agg(' { kind: ' || js_str(i.kind) || ', name: ' || js_str(i.name) || ', url: ' || js_str(i.url) || ' }',
                                                   ',' order by i.kind, i.sort_order, i.item_id)
                                 from hub_item i where i.section_id = s.section_id), '') || ' ] }',
                       E',\n' order by s.sort_order, s.section_id)
     from hub_section s), '') || E'\n];' || E'\n\n' ||

  'var PHONES = [' || E'\n' || coalesce((
     select string_agg('  { name: ' || js_str(office_name) || ', zip: ' || js_str(postal_code) || ', pos: ' || js_str(position_name) ||
                       ', unit: ' || js_str(affiliation) || ', tel: ' || js_str(phone_number) || ' }',
                       E',\n' order by phone_id)
     from phone_directory), '') || E'\n];' || E'\n\n' ||

  'var DASHBOARDS = [' || E'\n' || coalesce((
     select string_agg('  { name: ' || js_str(name) || ', url: ' || js_str(embed_url) || ' }',
                       E',\n' order by sort_order, dashboard_id)
     from dashboard), '') || E'\n];' || E'\n';
$$;

grant execute on function public.js_str(text), public.thai_date(date), public.site_content_js() to anon, authenticated;
