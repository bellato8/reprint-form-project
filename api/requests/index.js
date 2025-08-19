const { BlobServiceClient } = require("@azure/storage-blob");
const busboy = require("busboy");
const sharp = require("sharp");

const parseMultipartFormData = (req) => new Promise((resolve, reject) => {
    const bb = busboy({ headers: req.headers });
    const formData = {};
    const files = [];
    bb.on('file', (name, file, info) => {
        const chunks = [];
        file.on('data', (chunk) => chunks.push(chunk));
        file.on('end', () => files.push({ fieldName: name, buffer: Buffer.concat(chunks), info }));
    });
    bb.on('field', (name, val) => { formData[name] = val; });
    bb.on('finish', () => resolve({ formData, files }));
    bb.on('error', err => reject(err));
    bb.end(req.rawBody);
});

module.exports = async function (context, req) {
    context.log('Processing a new reprint request.');
    try {
        const { formData, files } = await parseMultipartFormData(req);
        if (files.length === 0) throw new Error("No image file was uploaded.");

        const imageFile = files[0];
        const now = new Date();

        // Generate Request ID
        const year = now.getFullYear() + 543;
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const timestamp = Date.now().toString().slice(-4);
        const requestId = `R${year}${month}${day}-${timestamp}`;

        // Watermark the image with Date and Time
        const timeString = now.toTimeString().split(' ')[0].substring(0, 5); // HH:MM
        const dateString = `${day}/${month}/${year}`;
        const watermarkText = `ใช้สำหรับ RE-PRINT บัตรจอดรถเท่านั้น\nที่ศูนย์การค้าอิมพีเรียลเวิลด์ สำโรง\nวันที่ ${dateString} เวลา ${timeString} น.`;

        const textSvg = Buffer.from(
            `<svg width="1000" height="800">
                <style>
                    .title { fill: rgba(255, 0, 0, 0.4); font-size: 50px; font-weight: bold; font-family: Arial, sans-serif; text-anchor: middle; }
                </style>
                <text x="50%" y="50%" class="title" transform="rotate(-20 500,400)">
                    ${watermarkText.split('\n').map((line, i) => `<tspan x="50%" dy="${i === 0 ? 0 : '1.2em'}">${line}</tspan>`).join('')}
                </text>
            </svg>`
        );

        const watermarkedImageBuffer = await sharp(imageFile.buffer)
            .composite([{ input: textSvg, tile: false }])
            .jpeg({ quality: 85 })
            .toBuffer();

        // Upload to Azure Blob Storage
        const connectionString = process.env.ReprintStorageConnectionString;
        if (!connectionString) throw new Error("Azure Storage Connection String is not configured.");

        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        const containerClient = blobServiceClient.getContainerClient("re-print-ids");
        const blobName = `${now.getFullYear()}/${month}/${day}/${requestId}.jpg`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);

        await blockBlobClient.upload(watermarkedImageBuffer, watermarkedImageBuffer.length, {
            blobHTTPHeaders: { blobContentType: "image/jpeg" }
        });

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
