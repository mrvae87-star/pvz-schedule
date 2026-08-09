-- Хранит последний известный баланс zvonok.com (обновляется при каждом
-- реальном звонке, так как отдельного метода "узнать баланс" у API нет —
-- баланс приходит только в ответе на сам звонок).
create table if not exists zvonok_status (
    id int primary key default 1,
    balance numeric,
    updated_at timestamptz default now(),
    constraint single_row check (id = 1)
);

alter table zvonok_status enable row level security;

create policy "Allow anon select on zvonok_status"
    on zvonok_status for select
    using (true);

create policy "Allow anon upsert on zvonok_status"
    on zvonok_status for insert
    with check (true);

create policy "Allow anon update on zvonok_status"
    on zvonok_status for update
    using (true);
