// api/requests/index.js
// Azure Function: /api/requests  (POST multipart/form-data)
// - ใช้ parse-multipart อ่านไฟล์จาก req.rawBody อย่างเสถียร
// - ตรวจสอบและประมวลผลรูปด้วย sharp ให้แน่ใจว่า buffer เป็นรูปจริง
// - รองรับไฟล์ที่มาจาก HEIC ที่ถูกแปลงเป็น JPEG แล้วจาก frontend

const multipart = require('parse-multipart');
const sharp = require('sharp');

module.exports = async function (context, req) {
  try {
    // 1) ตรวจ Content-Type และ raw body
    const contentType = (req.headers['content-type'] || req.headers['Content-Type'] || '').toString();
    if (!contentType.startsWith('multipart/form-data')) {
      context.res = { status: 415, body: 'Unsupported Media Type: must be multipart/form-data' };
      return;
    }

    // Azure Functions ให้ req.rawBody เป็น Buffer ได้อยู่แล้วใน Node runtime
    // แต่กันเหนียวรองรับกรณีได้เป็น string/base64
    const raw = Buffer.isBuffer(req.rawBody)
      ? req.rawBody
      : Buffer.isBuffer(req.body)
        ? req.body
        : typeof req.body === 'string'
          ? Buffer.from(req.body, 'base64')
          : null;

    if (!raw) {
      context.res = { status: 400, body: 'Bad Request: missing raw body' };
      return;
    }

    // 2) ดึง boundary แล้ว parse multipart
    const boundary = multipart.getBoundary(contentType);
    const parts = multipart.Parse(raw, boundary);
    if (!Array.isArray(parts) || parts.length === 0) {
      context.res = { status: 400, body: 'Bad Request: no parts found in multipart body' };
      return;
    }

    // 3) หาไฟล์ภาพ (มองหา part ที่มี filename/type)
    const filePart =
      parts.find(p => p.filename && p.data && p.data.length > 0) ||
      null;

    if (!filePart) {
      context.res = { status: 400, body: 'Bad Request: image file not found' };
      return;
    }

    const fileBuf = Buffer.from(filePart.data); // Uint8Array -> Buffer
    const fileName = filePart.filename || 'uploaded';
    const mime = (filePart.type || '').toLowerCase();

    // 4) ตรวจว่า buffer เป็นรูปได้จริง (ถ้า parse ผิด จะพังที่ metadata ทันที)
    let image = sharp(fileBuf, { failOn: 'none' }); // ป้องกันบางไฟล์ edge case
    let meta;
    try {
      meta = await image.metadata();
    } catch (e) {
      // มักเกิดจาก parse multipart ไม่ถูก ทำให้ sharp มองไม่เห็น header ของรูป
      context.res = {
        status: 415,
        body: `Unsupported image buffer (parse error): ${e.message}`
      };
      return;
    }

    // 5) ทำงานกับรูป (ตัวอย่าง: เติมลายน้ำมุมขวาล่าง + แปลงเป็น JPEG)
    // ถ้าต้อง composite กับ PNG watermark ให้เตรียมบัฟเฟอร์/ไฟล์ของ watermark เอง
    // ตัวอย่างง่าย: แค่รี-เอนโค้ด/ย่อขนาด
    image = sharp(fileBuf);

    // ตัวอย่าง: resize max 2000px และบันทึกเป็น JPEG คุณภาพ 85
    const watermarkedImageBuffer = await image
      .rotate() // auto-orient จาก EXIF
      .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();

    // 6) (ทางเลือก) อัปโหลด Blob Storage ที่นี่...
    // const { BlobServiceClient } = require('@azure/storage-blob');
    // ...อัปโหลด watermarkedImageBuffer ตามสะดวก

    // 7) ตอบกลับสำเร็จ
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        ok: true,
        fileName,
        mime,
        width: meta.width,
        height: meta.height,
        format: meta.format,
        size: watermarkedImageBuffer.length
      })
    };
  } catch (error) {
    // สำคัญ: ถ้าเจอ "Input buffer contains unsupported image format"
    // 99% คือ buffer ไม่ใช่รูปจริง (ส่วนใหญ่เพราะ parse multipart ผิด)
    context.res = {
      status: 500,
      body: `An error occurred: ${error.message}`
    };
  }
};
