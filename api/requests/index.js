const { BlobServiceClient } = require("@azure/storage-blob");
const multipart = require("parse-multipart-data");
const sharp = require("sharp");

module.exports = async function (context, req) {
    context.log('Processing a new reprint request with robust parser.');

    try {
        // 1. ตรวจสอบ Header และ Body ของ Request
        const contentType = req.headers['content-type'] || '';
        if (!contentType.startsWith('multipart/form-data')) {
            throw new Error('Content-Type must be multipart/form-data.');
        }
        if (!req.rawBody) {
            throw new Error('Request body is missing.');
        }

        // 2. ใช้ parse-multipart-data เพื่อแยกส่วนข้อมูล
        const boundary = multipart.getBoundary(contentType);
        const parts = multipart.parse(req.rawBody, boundary);

        const filePart = parts.find(p => p.filename && p.data);
        if (!filePart) {
            throw new Error('Image file not found in form data.');
        }

        const formData = {};
        parts.filter(p => !p.filename).forEach(p => {
            formData[p.name] = p.data.toString('utf-8');
        });

        // 3. ตรวจสอบไฟล์ด้วย Sharp Metadata ก่อน
        let imageMetadata;
        try {
            imageMetadata = await sharp(filePart.data).metadata();
        } catch (e) {
            throw new Error(`Invalid image buffer provided. Sharp metadata error: ${e.message}`);
        }

        // 4. สร้าง Request ID
        const now = new Date();
        const year = now.getFullYear() + 543;
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const timestamp = Date.now().toString().slice(-4);
        const requestId = `R${year}${month}${day}-${timestamp}`;

        // 5. ประทับตรารูปภาพ
        const timeString = now.toTimeString().split(' ')[0].substring(0, 5);
        const dateString = `${day}/${month}/${year}`;
        const watermarkText = `ใช้สำหรับ RE-PRINT บัตรจอดรถเท่านั้น\nที่ศูนย์การค้าอิมพีเรียลเวิลด์ สำโรง\nวันที่ ${dateString} เวลา ${timeString} น.`;

        const textSvg = Buffer.from(
            `<svg width="${imageMetadata.width}" height="${imageMetadata.height}">
                <style>
                    .title { fill: rgba(255, 0, 0, 0.4); font-size: ${Math.max(20, imageMetadata.width / 20)}px; font-weight: bold; font-family: Arial, sans-serif; text-anchor: middle; }
                </style>
                <text x="50%" y="50%" class="title" transform="rotate(-20 ${imageMetadata.width / 2},${imageMetadata.height / 2})">
                    ${watermarkText.split('\n').map((line, i) => `<tspan x="50%" dy="${i === 0 ? 0 : '1.2em'}">${line}</tspan>`).join('')}
                </text>
            </svg>`
        );

        const watermarkedImageBuffer = await sharp(filePart.data)
            .composite([{ input: textSvg, tile: false }])
            .jpeg({ quality: 85 })
            .toBuffer();

        // 6. อัปโหลดไปที่ Azure Blob Storage
        const connectionString = process.env.ReprintStorageConnectionString;
        if (!connectionString) throw new Error("Azure Storage Connection String is not configured.");

        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        const containerClient = blobServiceClient.getContainerClient("re-print-ids");
        const blobName = `${now.getFullYear()}/${month}/${day}/${requestId}.jpg`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);

        await blockBlobClient.upload(watermarkedImageBuffer, watermarkedImageBuffer.length, {
            blobHTTPHeaders: { blobContentType: "image/jpeg" }
        });

        // 7. ส่งคำตอบกลับ
        context.res = {
            status: 200,
            body: `Submission successful! Your Request ID is: ${requestId}`
        };

    } catch (error) {
        context.log.error(error);
        context.res = {
            status: 500,
            body: "An error occurred: " + error.message
        };
    }
};
