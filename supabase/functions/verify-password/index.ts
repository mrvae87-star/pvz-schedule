// ========================================
// EDGE FUNCTION: ПРОВЕРКА ПАРОЛЕЙ (ВХОД / АДМИН)
// ========================================
// Пароли хранятся только здесь, в секретах Supabase, и никогда не попадают
// в код сайта. Браузер присылает введённый пароль, функция сверяет его
// на сервере и возвращает только true/false — сам пароль клиенту не виден.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const LOGIN_PASSWORD = Deno.env.get("LOGIN_PASSWORD") || "";
const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD") || "";

// ====== CORS ======
// Без этих заголовков браузер блокирует запрос с сайта ещё ДО того,
// как он доходит до нашего кода (обрывается на служебном OPTIONS-запросе).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // Браузер сначала посылает служебный OPTIONS-запрос — отвечаем на него
  // сразу же, без какой-либо логики.
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return Response.json(
        { valid: false, error: "Method not allowed" },
        { status: 405, headers: corsHeaders }
      );
    }

    const { type, password } = await req.json();

    if (!type || typeof password !== "string") {
      return Response.json(
        { valid: false, error: "Bad request" },
        { status: 400, headers: corsHeaders }
      );
    }

    let expected = "";
    if (type === "login") {
      expected = LOGIN_PASSWORD;
    } else if (type === "admin") {
      expected = ADMIN_PASSWORD;
    } else {
      return Response.json(
        { valid: false, error: "Unknown type" },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!expected) {
      console.warn(`⚠️ Пароль типа "${type}" не задан в секретах Supabase`);
      return Response.json(
        { valid: false, error: "Password not configured" },
        { status: 500, headers: corsHeaders }
      );
    }

    const valid = password === expected;
    console.log(`🔐 Проверка пароля типа "${type}": ${valid ? "верный" : "неверный"}`);
    return Response.json({ valid }, { headers: corsHeaders });
  } catch (error) {
    console.error("❌ Ошибка проверки пароля:", error);
    return Response.json(
      { valid: false, error: String(error) },
      { status: 500, headers: corsHeaders }
    );
  }
});
