// ========================================
// EDGE FUNCTION: ЕЖЕДНЕВНЫЙ БЭКАП В ЯНДЕКС.ДИСК
// ========================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const YANDEX_TOKEN = Deno.env.get("YANDEX_DISK_TOKEN") || "";

// Таблицы, которые нужно выгружать. Сейчас — только финансовый блок
// Дашборда: Основной расчёт, Подработки, Штрафы.
const TABLES = [
  "salary",
  "extra_works",
  "fines",
];

// ====== ПРЕВРАЩАЕМ МАССИВ ОБЪЕКТОВ В CSV (открывается в Excel) ======
function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows || rows.length === 0) return "";
  const headers = Object.keys(rows[0]);

  const escapeCell = (val: unknown): string => {
    if (val === null || val === undefined) return "";
    const str = typeof val === "object" ? JSON.stringify(val) : String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCell(row[h])).join(","));
  }
  // \uFEFF — BOM, чтобы Excel правильно показывал русские буквы
  return "\uFEFF" + lines.join("\n");
}

// ====== СОЗДАЁМ ПАПКУ НА ЯНДЕКС.ДИСКЕ (если её ещё нет) ======
async function ensureFolder(path: string) {
  const url = `https://cloud-api.yandex.net/v1/disk/resources?path=${encodeURIComponent(path)}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `OAuth ${YANDEX_TOKEN}` },
  });
  // 409 = папка уже существует, это нормально и не является ошибкой
  if (!response.ok && response.status !== 409) {
    const text = await response.text();
    console.warn(`⚠️ Не удалось создать папку ${path}: ${response.status} ${text}`);
  }
}

// ====== ЗАГРУЖАЕМ ОДИН ФАЙЛ НА ЯНДЕКС.ДИСК ======
async function uploadFile(path: string, content: string) {
  const getUrlResp = await fetch(
    `https://cloud-api.yandex.net/v1/disk/resources/upload?path=${encodeURIComponent(path)}&overwrite=true`,
    { headers: { Authorization: `OAuth ${YANDEX_TOKEN}` } }
  );

  if (!getUrlResp.ok) {
    const text = await getUrlResp.text();
    throw new Error(`Не удалось получить ссылку для загрузки ${path}: ${getUrlResp.status} ${text}`);
  }

  const { href } = await getUrlResp.json();

  const uploadResp = await fetch(href, {
    method: "PUT",
    body: content,
  });

  if (!uploadResp.ok) {
    throw new Error(`Ошибка загрузки файла ${path}: ${uploadResp.status}`);
  }
}

// ========================================
// ОСНОВНАЯ ФУНКЦИЯ
// ========================================

Deno.serve(async () => {
  try {
    if (!YANDEX_TOKEN) {
      console.error("❌ Не задан секрет YANDEX_DISK_TOKEN");
      return Response.json(
        { success: false, error: "Missing YANDEX_DISK_TOKEN secret" },
        { status: 500 }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      console.error("❌ Отсутствуют переменные Supabase");
      return Response.json(
        { success: false, error: "Missing Supabase credentials" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const moscowDate = new Date().toLocaleString("en-CA", {
      timeZone: "Europe/Moscow",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    const baseFolder = "/PVZ-Backups";
    const dayFolder = `${baseFolder}/${moscowDate}`;

    console.log(`📦 Начинаем бэкап за ${moscowDate}...`);

    await ensureFolder(baseFolder);
    await ensureFolder(dayFolder);

    const results: Record<string, number | string> = {};

    for (const table of TABLES) {
      const { data, error } = await supabase.from(table).select("*");

      if (error) {
        console.error(`❌ Ошибка чтения таблицы ${table}:`, error.message);
        results[table] = `ошибка: ${error.message}`;
        continue;
      }

      const rows = data ?? [];
      const csv = toCSV(rows);
      const filePath = `${dayFolder}/${table}.csv`;

      try {
        await uploadFile(filePath, csv || "\uFEFFнет данных");
        results[table] = rows.length;
        console.log(`✅ ${table}: ${rows.length} строк выгружено`);
      } catch (uploadError) {
        console.error(`❌ Ошибка загрузки ${table}:`, uploadError);
        results[table] = `ошибка загрузки: ${String(uploadError)}`;
      }
    }

    console.log(`🎉 Бэкап завершён: ${dayFolder}`);

    return Response.json({
      success: true,
      folder: dayFolder,
      results,
    });
  } catch (error) {
    console.error("❌ Ошибка бэкапа:", error);
    return Response.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
});
