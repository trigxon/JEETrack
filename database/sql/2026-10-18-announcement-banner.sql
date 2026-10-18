-- 2026-10-18 — Announcement / broadcast banner support on app_config
-- Admin composes a message in the admin panel (Actions page); the app and
-- landing page render it as a dismissible floating pill. Stored on the
-- existing single-row app_config table (id=1) so the client — which already
-- reads that row for the public stats counters — picks it up with zero extra
-- requests. Writes only ever happen through the admin API (service key);
-- anon RLS already allows SELECT on app_config for the counters.

alter table app_config add column if not exists announcement_text text not null default '';
alter table app_config add column if not exists announcement_level text not null default 'info';
alter table app_config add column if not exists announcement_active boolean not null default false;
alter table app_config add column if not exists announcement_updated_at timestamptz;
