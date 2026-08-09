-- ========================================
-- ТАБЛИЦЫ ДЛЯ МОДУЛЯ ЧЕКИНА + ZVONOK.COM
-- Выполнить в Supabase → SQL Editor
-- ========================================

-- Таблица чекинов сотрудников (кто и когда отметился на смену)
create table if not exists checkins (
    id uuid primary key default gen_random_uuid(),
    employee_name text not null,
    pvz_name text not null,
    checkin_date date not null,           -- дата смены (YYYY-MM-DD)
    checkin_time timestamptz not null default now(),
    status text not null default 'confirmed',
    created_at timestamptz not null default now(),

    -- один сотрудник может отметиться на конкретную дату только один раз
    unique (employee_name, checkin_date)
);

create index if not exists idx_checkins_date on checkins (checkin_date);
create index if not exists idx_checkins_employee on checkins (employee_name);

-- Таблица логов уведомлений (чтобы не звонить повторно за один и тот же пропуск)
create table if not exists checkin_logs (
    id uuid primary key default gen_random_uuid(),
    employee_name text not null,
    pvz_name text not null,
    checkin_date date not null,
    status text not null default 'missed',
    notified_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);

create index if not exists idx_checkin_logs_date on checkin_logs (checkin_date, employee_name);

-- ========================================
-- RLS (Row Level Security)
-- Приложение обращается к checkins с публичным (anon) ключом из браузера,
-- поэтому включаем RLS и даём анонимному ключу доступ на чтение/запись.
-- Edge Function использует service_role ключ и обходит RLS автоматически.
-- ========================================

alter table checkins enable row level security;
alter table checkin_logs enable row level security;

-- Разрешаем анонимному (публичному) ключу читать и создавать чекины
create policy "checkins_select_anon" on checkins
    for select using (true);

create policy "checkins_insert_anon" on checkins
    for insert with check (true);

-- checkin_logs пишет только Edge Function (service_role), поэтому политику
-- для anon-ключа НЕ создаём — обычным пользователям читать/писать сюда не нужно.
