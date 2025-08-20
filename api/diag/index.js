// /api/diag — ตรวจสุขภาพระบบ: ENV, Storage, SQL
const { BlobServiceClient } = require("@azure/storage-blob");
const { Connection } = require("tedious");

function buildSqlConnectionFromEnv() {
  const server = process.env.SqlServer;
  const database = process.env.SqlDatabase;
  const userName = process.env.SqlUser;
  const password = process.env.SqlPassword;

  if (server && database && userName && password) {
    return new Connection({
      server,
      authentication: { type: "default", options: { userName, password } },
      options: { database, encrypt: true }
    });
  }
  const cs = process.env.SqlConnectionString;
  if (!cs) return null;
  const srv = (cs.match(/Server=tcp:([^,]+)/) || [])[1];
  const db = (cs.match(/Initial Catalog=([^;]+)/) || [])[1];
  const user = (cs.match(/User ID=([^;]+)/) || [])[1];
  const pass = (cs.match(/Password=([^;]+)/) || [])[1];
  if (!srv || !db || !user || !pass) return null;
  return new Connection({
    server: srv,
    authentication: { type: "default", options: { userName: user, password: pass } },
    options: { database: db, encrypt: true }
  });
}

module.exports = async function (context, req) {
  const out = { ok: true, env: {}, checks: {} };
  try {
    // 1) ตรวจ ENV หลัก
    out.env.hasStorageCS = !!process.env.ReprintStorageConnectionString;
    out.env.hasSqlVars = !!(process.env.SqlServer && process.env.SqlDatabase && process.env.SqlUser && process.env.SqlPassword);
    out.env.hasSqlCS = !!process.env.SqlConnectionString;

    // 2) ตรวจ Azure Blob Storage
    try {
      if (!process.env.ReprintStorageConnectionString) throw new Error("ReprintStorageConnectionString missing");
      const svc = BlobServiceClient.fromConnectionString(process.env.ReprintStorageConnectionString);
      const container = svc.getContainerClient("re-print-ids");
      const exists = await container.exists();
      if (!exists) await container.create();
      const props = await container.getProperties();
      out.checks.storage = { ok: true, containerPropsETag: props.etag || null };
    } catch (e) {
      out.ok = false;
      out.checks.storage = { ok: false, error: e.message };
    }

    // 3) ตรวจเชื่อมต่อ SQL (ping แบบ connect/disconnect)
    try {
      const conn = buildSqlConnectionFromEnv();
      if (!conn) throw new Error("SQL config not found");
      await new Promise((resolve, reject) => conn.on("connect", err => (err ? reject(err) : resolve())));
      conn.close();
      out.checks.sql = { ok: true };
    } catch (e) {
      out.ok = false;
      out.checks.sql = { ok: false, error: e.message };
    }

    // 4) ขนาดคำขอประมาณการ/คำแนะนำ (ช่วยเดาว่าภาพใหญ่เกินหรือไม่)
    out.note = "ถ้าภาพใหญ่เกิน ~3MB (Base64 ~4MB+) อาจติดลิมิตของ Static Web Apps ให้ลดขนาดภาพฝั่ง client";

    context.res = { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" }, body: out };
  } catch (err) {
    context.res = { status: 500, body: { ok: false, error: err.message, out } };
  }
};
