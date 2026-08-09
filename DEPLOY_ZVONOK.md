# Подключение zvonok.com — инструкция по деплою

## Что изменилось

- **`supabase_checkins.sql`** — создаёт таблицы `checkins` и `checkin_logs`.
- **`supabase/functions/check-checkins/index.ts`** — Edge Function: раз в
  запуск проверяет, кто не отметился на смену, и звонит руководителю через
  zvonok.com. API-ключи хранятся в секретах Supabase, а не в браузере.
- **`js/config/supabase.js`** — добавлены `saveCheckin()` и
  `getCheckinsForDate()`.
- **`js/app.js`** — чекин теперь пишется в Supabase (`confirmCheckin`),
  статус подтягивается из Supabase (`loadCheckinData`), а прямой вызов
  API zvonok.com из браузера убран из `notifyManager`.
- **`js/config/constants.js`** — убраны `ZVONOK_PUBLIC_KEY`,
  `ZVONOK_API_KEY`, `ZVONOK_CAMPAIGN_ID` и функция `sendZvonokCall()` —
  они больше не нужны на клиенте.

## Шаг 1. Создать таблицы в Supabase

Supabase Dashboard → **SQL Editor** → вставить содержимое
`supabase_checkins.sql` → Run.

## Шаг 2. Установить Supabase CLI (если ещё не установлен)

```bash
npm install -g supabase
```

## Шаг 3. Залогиниться и привязать проект

```bash
supabase login
supabase link --project-ref <ваш-project-ref>
```

`<ваш-project-ref>` — это часть URL из `js/config/supabase.js`
(`https://<project-ref>.supabase.co`), у вас это `zavxflpcsshtnhbcgqhp`.

## Шаг 4. Задать секреты для Edge Function

```bash
supabase secrets set ZVONOK_PUBLIC_KEY=ваш_public_key_из_кабинета_zvonok
supabase secrets set ZVONOK_CAMPAIGN_ID=ваш_id_кампании
supabase secrets set MANAGER_PHONE=79991234567
```

Взять `public_key` и `campaign_id` можно в личном кабинете zvonok.com:
- public_key: Настройки профиля → https://zvonok.com/manager/users/profile-settings/
- campaign_id: список ваших кампаний в разделе "Кампании"

`SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` Supabase подставляет в Edge
Functions автоматически — их задавать не нужно.

## Шаг 5. Задеплоить функцию

```bash
supabase functions deploy check-checkins
```

## Шаг 6. Настроить автозапуск по расписанию (cron)

Проще всего — через Dashboard: **Edge Functions → check-checkins →
Schedule** и указать, например, `*/10 * * * *` (каждые 10 минут).

Либо через SQL (`pg_cron` + `pg_net`), если предпочитаете:

```sql
select cron.schedule(
  'check-checkins-job',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://<ваш-project-ref>.functions.supabase.co/check-checkins',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <ваш-anon-или-service-role-ключ>'
    )
  );
  $$
);
```

## Шаг 7. Проверить вручную

```bash
supabase functions invoke check-checkins
```

Или открыть в браузере/Postman:
`https://<ваш-project-ref>.functions.supabase.co/check-checkins`

В логах (`supabase functions logs check-checkins`) должно быть видно,
кто сегодня работает, кто отметился, и (если время дедлайна уже прошло)
попытку звонка.

## Шаг 8. Обновить сайт

Загрузите новую версию `js/app.js`, `js/config/supabase.js`,
`js/config/constants.js`, `js/utils/helpers.js` туда, где размещён сайт.
