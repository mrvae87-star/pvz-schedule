// ========================================
// EDGE FUNCTION: ПРОВЕРКА ЧЕКИНОВ
// ========================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ====== КЛЮЧИ ИЗ СЕКРЕТОВ SUPABASE ======
const ZVONOK_PUBLIC_KEY = Deno.env.get("ZVONOK_PUBLIC_KEY") || "";
const ZVONOK_CAMPAIGN_ID = Deno.env.get("ZVONOK_CAMPAIGN_ID") || "";

// ====== ПРОВЕРКА НАСТРОЕК ======
if (!ZVONOK_PUBLIC_KEY || !ZVONOK_CAMPAIGN_ID) {
  console.warn("⚠️ Zvonok не настроен:");
  if (!ZVONOK_PUBLIC_KEY) console.warn("  - отсутствует ZVONOK_PUBLIC_KEY");
  if (!ZVONOK_CAMPAIGN_ID) console.warn("  - отсутствует ZVONOK_CAMPAIGN_ID");
}

// ========================================
// ТИПЫ
// ========================================

interface Schedule {
  id: string;
  pvz_name: string;
  employee_name: string;
  year: number;
  month: number;
  day: number;
  is_working: boolean;
  created_at: string;
}

interface PvzSetting {
  id: string;
  pvz_name: string;
  open_time: string;
  created_at: string;
  updated_at: string;
}

interface Checkin {
  id: string;
  employee_name: string;
  pvz_name: string;
  checkin_date: string;
  checkin_time: string;
  status: string;
  created_at: string;
}

interface PvzTimes {
  [pvzName: string]: string;
}

// ========================================
// ОСНОВНАЯ ФУНКЦИЯ
// ========================================

Deno.serve(async () => {
  try {
    // ====== ИНИЦИАЛИЗАЦИЯ SUPABASE ======
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      console.error("❌ Отсутствует SUPABASE_SERVICE_ROLE_KEY");
      return Response.json(
        { success: false, error: "Missing Supabase service role key" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log("✅ Supabase клиент инициализирован");

    // ====== НОМЕРА ДЛЯ ЗВОНКА (из таблицы manager_phones, с запасным ======
    // ====== вариантом через старый секрет MANAGER_PHONE) ======
    let MANAGER_PHONES: string[] = [];
    try {
      const { data: phoneRows, error: phoneError } = await supabase
        .from('manager_phones')
        .select('phone');

      if (!phoneError && phoneRows && phoneRows.length > 0) {
        MANAGER_PHONES = phoneRows.map((r: { phone: string }) => r.phone).filter(Boolean);
        console.log(`📱 Загружено ${MANAGER_PHONES.length} номер(ов) из таблицы manager_phones`);
      }
    } catch (error) {
      console.warn('⚠️ Не удалось загрузить manager_phones, пробуем секрет MANAGER_PHONE:', error);
    }

    if (MANAGER_PHONES.length === 0) {
      const envPhones = (Deno.env.get("MANAGER_PHONE") || "")
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      if (envPhones.length > 0) {
        MANAGER_PHONES = envPhones;
        console.log(`📱 Загружено ${MANAGER_PHONES.length} номер(ов) из секрета MANAGER_PHONE (запасной вариант)`);
      }
    }

    if (MANAGER_PHONES.length === 0) {
      console.warn("⚠️ Нет ни одного номера для звонка — ни в manager_phones, ни в секрете MANAGER_PHONE");
    }

    // ====== МОСКОВСКОЕ ВРЕМЯ ======
    const moscowDate = new Date().toLocaleString("en-CA", {
      timeZone: "Europe/Moscow",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });

    const today = moscowDate;

    const now = new Date(
      new Date().toLocaleString("en-US", {
        timeZone: "Europe/Moscow"
      })
    );

    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    console.log(`🕐 Дата: ${today}, Время: ${now.toLocaleTimeString('ru-RU')}`);
    console.log(`🔍 Проверка чекинов...`);
    console.log(`📱 Номеров для уведомления: ${MANAGER_PHONES.length}`);

    // ====== 1. ПОЛУЧАЕМ РАСПИСАНИЕ ======
    const { data: schedules, error: scheduleError } = await supabase
      .from('schedules')
      .select('*')
      .eq('year', now.getFullYear())
      .eq('month', now.getMonth() + 1)
      .eq('day', now.getDate())
      .eq('is_working', true);

    if (scheduleError) {
      console.error('❌ Ошибка загрузки графика:', scheduleError);
      return Response.json(
        { success: false, error: scheduleError.message },
        { status: 500 }
      );
    }

    if (!schedules || schedules.length === 0) {
      console.log('📅 Сегодня никто не работает');
      return Response.json({
        success: true,
        message: 'No employees working today',
        date: today
      });
    }

    // ====== ЗАЩИТА: ИГНОРИРУЕМ СМЕНЫ УДАЛЁННЫХ ПВЗ И "ОСИРОТЕВШИЕ" ЗАПИСИ ======
    // 1) Если ПВЗ удалили с сайта, но в schedules осталась "осиротевшая"
    //    запись — не звоним по ней.
    // 2) Если сотрудника убрали с конкретного ПВЗ через интерфейс сайта,
    //    но по какой-то причине его смена осталась висеть в schedules —
    //    тоже не звоним, сверяясь со списком сотрудников ПВЗ на этот месяц
    //    (employees_history в таблице pvz — это то, что реально видно
    //    на календаре сайта).
    const { data: activePvzList } = await supabase.from('pvz').select('name, employees_history');
    const activePvzNames = new Set((activePvzList ?? []).map((p: { name: string }) => p.name));
    const monthKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
    const rosterByPvz = new Map<string, Set<string>>();
    (activePvzList ?? []).forEach((p: { name: string; employees_history: Record<string, string[]> }) => {
      const roster = (p.employees_history && p.employees_history[monthKey]) || [];
      rosterByPvz.set(p.name, new Set(roster));
    });

    const validSchedules = schedules.filter((s: { pvz_name: string; employee_name: string }) => {
      if (!activePvzNames.has(s.pvz_name)) return false;
      const roster = rosterByPvz.get(s.pvz_name);
      // Если по этому ПВЗ вообще нет данных о составе на месяц — не блокируем
      // (осторожность на случай нестандартных/старых записей), но если
      // список есть и сотрудника в нём нет — считаем запись "осиротевшей".
      if (roster && roster.size > 0 && !roster.has(s.employee_name)) return false;
      return true;
    });
    const skippedCount = schedules.length - validSchedules.length;
    if (skippedCount > 0) {
      console.warn(`⚠️ Пропущено ${skippedCount} смен(ы) от удалённых ПВЗ или сотрудников, убранных из состава ПВЗ`);
    }

    if (validSchedules.length === 0) {
      console.log('📅 Сегодня никто не работает (после фильтра по актуальным ПВЗ)');
      return Response.json({
        success: true,
        message: 'No employees working today (after filtering deleted PVZ)',
        date: today
      });
    }

    console.log(`👥 Найдено ${validSchedules.length} сотрудников`);

    // ====== 2. ПОЛУЧАЕМ НАСТРОЙКИ ВРЕМЕНИ ОТКРЫТИЯ ======
    let pvzTimes: PvzTimes = {};
    
    try {
      const { data: pvzSettings, error: settingsError } = await supabase
        .from('pvz_settings')
        .select('*');

      if (settingsError || !pvzSettings || pvzSettings.length === 0) {
        pvzTimes = getDefaultPvzTimes();
      } else {
        (pvzSettings ?? []).forEach((setting: PvzSetting) => {
          const openTime = setting.open_time ? setting.open_time.substring(0, 5) : '09:00';
          pvzTimes[setting.pvz_name] = openTime;
        });
        console.log(`✅ Загружено ${pvzSettings.length} настроек ПВЗ`);
      }
    } catch (error) {
      console.warn('⚠️ Ошибка загрузки pvz_settings, используем дефолтные');
      pvzTimes = getDefaultPvzTimes();
    }

    // ====== 3. ПОЛУЧАЕМ ЧЕКИНЫ ======
    const { data: checkins, error: checkinError } = await supabase
      .from('checkins')
      .select('*')
      .eq('checkin_date', today);

    if (checkinError) {
      console.error('❌ Ошибка загрузки чекинов:', checkinError);
      return Response.json(
        { success: false, error: checkinError.message },
        { status: 500 }
      );
    }

    const checkedInEmployees = new Map();
    (checkins ?? []).forEach((checkin: Checkin) => {
      checkedInEmployees.set(checkin.employee_name, checkin);
    });

    console.log(`✅ ${(checkins ?? []).length} сотрудников отметились`);

    // ====== 4. ПРОВЕРКА ======
    const missedEmployees = [];
    const logs = [];

    for (const schedule of validSchedules) {
      const employeeName = schedule.employee_name;
      const pvzName = schedule.pvz_name;
      
      if (checkedInEmployees.has(employeeName)) {
        console.log(`✅ ${employeeName} уже отметился`);
        continue;
      }

      const openTime = pvzTimes[pvzName] || '09:00';
      const [openHour, openMinute] = openTime.split(':').map(Number);
      const openMinutes = openHour * 60 + openMinute;
      const deadlineMinutes = openMinutes - 30;

      if (currentMinutes >= deadlineMinutes) {
        console.log(`❌ ${employeeName} НЕ ОТМЕТИЛСЯ!`);
        missedEmployees.push({
          employee: employeeName,
          pvz: pvzName,
          openTime: openTime,
          deadlineTime: `${Math.floor(deadlineMinutes / 60)}:${String(deadlineMinutes % 60).padStart(2, '0')}`
        });
      }
    }

    // ====== 5. ЗВОНКИ ======
    // zvonok.com разрешает не больше 1 звонка НА ОДИН НОМЕР каждые 5 секунд.
    // Звонки на разные номера друг другу не мешают, поэтому пауза нужна
    // только перед повторным звонком на тот же самый номер.
    // На каждый номер звоним CALLS_PER_NUMBER раз подряд — некоторые
    // телефоны блокируют первый входящий как "спам" и не звонят вовсе,
    // а с нескольких попыток шанс дозвониться заметно выше.
    const CALLS_PER_NUMBER = 3;
    const lastCallTimeByPhone: Record<string, number> = {};

    for (const missed of missedEmployees) {
      // Проверяем, звонили ли уже
      const { data: existingLog } = await supabase
        .from('checkin_logs')
        .select('id')
        .eq('employee_name', missed.employee)
        .eq('checkin_date', today)
        .eq('status', 'missed')
        .limit(1);

      if (existingLog && existingLog.length > 0) {
        console.log(`⚠️ Уже уведомляли ${missed.employee}`);
        continue;
      }

      // Звоним на все номера, по несколько раз на каждый
      let anySucceeded = false;

      for (const phone of MANAGER_PHONES) {
        for (let attempt = 1; attempt <= CALLS_PER_NUMBER; attempt++) {
          const lastCall = lastCallTimeByPhone[phone] || 0;
          const elapsed = Date.now() - lastCall;
          const waitNeeded = 5500 - elapsed;

          if (waitNeeded > 0) {
            console.log(`⏳ Пауза ${Math.ceil(waitNeeded / 1000)} сек перед звонком №${attempt} на +${phone} (лимит zvonok.com)...`);
            await new Promise((resolve) => setTimeout(resolve, waitNeeded));
          }

          console.log(`📞 Попытка ${attempt}/${CALLS_PER_NUMBER} на +${phone}`);
          const callResult = await sendZvonokCall(
            phone,
            missed.employee,
            missed.pvz,
            missed.openTime,
            missed.deadlineTime
          );

          lastCallTimeByPhone[phone] = Date.now();

          if (callResult.success) {
            anySucceeded = true;

            // ====== СОХРАНЯЕМ БАЛАНС ======
            // Отдельного метода "узнать баланс" у API zvonok.com нет —
            // он приходит только в ответе на реальный звонок, поэтому
            // сохраняем его каждый раз, когда он есть.
            const balanceValue = callResult.data?.balance;
            if (balanceValue !== undefined) {
              const { error: balanceError } = await supabase
                .from('zvonok_status')
                .upsert({ id: 1, balance: parseFloat(balanceValue), updated_at: new Date().toISOString() });
              if (balanceError) {
                console.warn('⚠️ Не удалось сохранить баланс zvonok.com:', balanceError);
              }
            }
          }
        }
      }

      if (anySucceeded) {
        logs.push({
          employee_name: missed.employee,
          pvz_name: missed.pvz,
          checkin_date: today,
          status: 'missed',
          notified_at: new Date().toISOString()
        });
      }
    }

    // ====== 6. СОХРАНЯЕМ ЛОГИ ======
    if (logs.length > 0) {
      await supabase.from('checkin_logs').insert(logs);
      console.log(`✅ Сохранено ${logs.length} логов`);
    }

    console.log(`📊 Итог: ${missedEmployees.length} пропустили, звонков: ${logs.length}`);
    return Response.json({
      success: true,
      date: today,
      missed: missedEmployees.length,
      calls_made: logs.length
    });

  } catch (error) {
    console.error('❌ Ошибка:', error);
    return Response.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
});

// ========================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ========================================

function getDefaultPvzTimes(): PvzTimes {
  return {
    'ПВЗ Центральный': '09:00',
    'ПВЗ Северный': '10:00',
    'ПВЗ Южный': '08:30',
    'ПВЗ Восточный': '11:00'
  };
}

// ========================================
// ОТПРАВКА ЗВОНКА
// ========================================

async function sendZvonokCall(
  phone: string,
  employeeName: string,
  pvzName: string,
  openTime: string,
  deadlineTime: string
) {
  try {
    if (!ZVONOK_PUBLIC_KEY || !ZVONOK_CAMPAIGN_ID || !phone) {
      console.warn("⚠️ Zvonok не настроен, звонок не отправлен");
      return { success: false, error: "Zvonok not configured" };
    }

    const message = 
      `Внимание. Сотрудник ${employeeName} не отметился на смену в пункте выдачи ${pvzName}. ` +
      `Дедлайн был ${deadlineTime}. Пункт выдачи открывается в ${openTime}. ` +
      `Требуется срочно проверить ситуацию.`;

    const cleanPhone = phone.replace(/[^0-9]/g, '');

    if (!cleanPhone) {
      throw new Error("Телефон не указан");
    }

    console.log(`📞 Звонок на +${cleanPhone}...`);

    const params = new URLSearchParams({
      public_key: ZVONOK_PUBLIC_KEY,
      phone: cleanPhone,
      campaign_id: ZVONOK_CAMPAIGN_ID,
      text: message
    });

    const response = await fetch(
      "https://zvonok.com/manager/cabapi_external/api/v1/phones/call/",
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      }
    );

    const rawText = await response.text();
    console.log("📋 Ответ Zvonok:", rawText);

    // ====== ПРОВЕРЯЕМ РЕАЛЬНЫЙ СТАТУС ОТВЕТА ======
    // zvonok.com всегда отвечает 200 OK, даже при ошибке (например, при
    // превышении лимита "1 звонок/5 сек"). Поэтому нельзя считать звонок
    // успешным просто по факту HTTP-ответа — нужно разобрать JSON и
    // проверить поле status.
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      console.error("❌ Не удалось разобрать ответ Zvonok как JSON:", rawText);
      return { success: false, error: `Invalid response: ${rawText}` };
    }

    // При ошибке zvonok.com возвращает {"status":"error","data":"..."}.
    // При успехе — {"call_id":..., "phone":..., "balance":...} БЕЗ поля status.
    // Поэтому ошибку определяем явно, а всё остальное считаем успехом.
    if (parsed && parsed.status === 'error') {
      console.error("❌ Zvonok вернул ошибку:", parsed.data);
      return { success: false, error: parsed.data };
    } else if (parsed && parsed.call_id) {
      console.log("✅ Звонок реально принят Zvonok, call_id:", parsed.call_id);
      return { success: true, data: parsed };
    } else {
      console.warn("⚠️ Неожиданный формат ответа Zvonok:", parsed);
      return { success: false, error: `Unexpected response: ${rawText}` };
    }

  } catch (error) {
    console.error('❌ Ошибка звонка:', error);
    return { success: false, error: String(error) };
  }
}
