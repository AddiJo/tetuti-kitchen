// Kelola akun admin dari dashboard: daftar, tambah, dan cabut akses.
// Membuat dan menghapus akun butuh kunci rahasia, jadi dikerjakan di sini,
// bukan di browser. Pemanggil harus admin yang sedang masuk.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const ORIGINS = ["https://www.tetuti.my.id", "https://tetuti.my.id"];
const PASSWORD_MIN = 8;
// Supabase Auth menolak sandi lebih dari 72 karakter.
const PASSWORD_MAX = 72;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Kunci format baru ada di SUPABASE_SECRET_KEYS (JSON per nama kunci);
// SUPABASE_SERVICE_ROLE_KEY hanya untuk proyek yang masih memakai kunci lama.
function secretKey(): string {
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) {
    const named = JSON.parse(keys) as Record<string, string>;
    const key = named.default ?? Object.values(named)[0];
    if (key) return key;
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
}

const admin = createClient(Deno.env.get("SUPABASE_URL")!, secretKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

async function listAdmins(me: string) {
  const { data: rows, error } = await admin.from("admins").select("user_id, created_at").order("created_at");
  if (error) throw error;
  const list = [];
  for (const row of rows) {
    const { data } = await admin.auth.admin.getUserById(row.user_id);
    list.push({
      id: row.user_id,
      email: data.user?.email ?? null,
      created_at: row.created_at,
      last_sign_in_at: data.user?.last_sign_in_at ?? null,
      self: row.user_id === me,
    });
  }
  return list;
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get("Origin"));
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  const fail = (message: string, status = 400) => reply({ error: message }, status);

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return fail("Metode tidak didukung.", 405);

  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return fail("Sesi habis. Silakan masuk lagi.", 401);
    const { data: caller, error: callerError } = await admin.auth.getUser(token);
    if (callerError || !caller.user) return fail("Sesi habis. Silakan masuk lagi.", 401);
    const me = caller.user.id;
    const { data: mine, error: mineError } = await admin
      .from("admins")
      .select("user_id")
      .eq("user_id", me)
      .maybeSingle();
    if (mineError) throw mineError;
    if (!mine) return fail("Akun ini tidak punya akses admin.", 403);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return fail("Permintaan tidak valid.");
    }

    if (body.action === "list") return reply({ admins: await listAdmins(me) });

    if (body.action === "create") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      if (!EMAIL.test(email)) return fail("Email tidak valid.");
      if (password.length < PASSWORD_MIN) return fail(`Sandi sementara minimal ${PASSWORD_MIN} karakter.`);
      if (password.length > PASSWORD_MAX) return fail(`Sandi sementara maksimal ${PASSWORD_MAX} karakter.`);

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createError) {
        if (createError.code === "email_exists" || /already been registered/i.test(createError.message)) {
          return fail("Email ini sudah terdaftar.", 409);
        }
        if (createError.code === "weak_password") {
          return fail("Sandi sementara terlalu lemah. Pakai gabungan huruf besar, huruf kecil, angka, dan simbol.");
        }
        throw createError;
      }
      const { error: insertError } = await admin.from("admins").insert({ user_id: created.user.id });
      if (insertError) {
        await admin.auth.admin.deleteUser(created.user.id);
        throw insertError;
      }
      return reply({ admins: await listAdmins(me) });
    }

    if (body.action === "remove") {
      const id = String(body.user_id ?? "");
      if (!UUID.test(id)) return fail("Akun tidak dikenali.");
      if (id === me) return fail("Akses akun sendiri tidak bisa dicabut. Minta admin lain melakukannya.");
      const { data: target, error: targetError } = await admin
        .from("admins")
        .select("user_id")
        .eq("user_id", id)
        .maybeSingle();
      if (targetError) throw targetError;
      if (!target) return fail("Akun ini sudah bukan admin.", 404);
      // Menghapus akun ikut menghapus barisnya di admins dan semua sesinya.
      const { error: deleteError } = await admin.auth.admin.deleteUser(id);
      if (deleteError) throw deleteError;
      return reply({ admins: await listAdmins(me) });
    }

    return fail("Permintaan tidak dikenal.");
  } catch (error) {
    console.error(error);
    return fail("Terjadi kesalahan di server. Coba lagi.", 500);
  }
});
