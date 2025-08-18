const { BlobServiceClient } = require("@azure/storage-blob");
const busboy = require("busboy");
const sharp = require("sharp");

// --- Helper function to parse multipart form data ---
const parseMultipartFormData = (req) => {
    return new Promise((resolve, reject) => {
        const bb = busboy({ headers: req.headers });
        const formData = {};
        const files = [];

        bb.on('file', (name, file, info) => {
            const chunks = [];
            file.on('data', (chunk) => chunks.push(chunk));
            file.on('end', () => {
                files.push({
                    fieldName: name,
                    buffer: Buffer.concat(chunks),
                    info: info,
                });
            });
        });

        bb.on('field', (name, val) => {
            formData[name] = val;
        });

        bb.on('finish', () => {
            resolve({ formData, files });
        });

        bb.on('error', err => {
            reject(err);
        });

        bb.end(req.rawBody);
    });
};

// --- Main Function Logic ---
module.exports = async function (context, req) {
    context.log('Processing a new reprint request.');

    try {
        // 1. Parse the incoming form data
        const { formData, files } = await parseMultipartFormData(req);
        if (files.length === 0) {
            throw new Error("No image file was uploaded.");
        }
        const imageFile = files[0];

        // 2. Generate a Request ID (Simple version, not accounting for race conditions)
        const now = new Date();
        const year = now.getFullYear() + 543; // Buddhist Era
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const timestamp = Date.now().toString().slice(-4); // Simple sequential number for demo
        const requestId = `R${year}${month}${day}-${timestamp}`;

        // 3. Watermark the image using Sharp
        const today = new Date();
        const dateString = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear() + 543}`;
        const watermarkText = `ใช้สำหรับ RE-PRINT บัตรจอดรถ\nที่ศูนย์การค้าอิมพีเรียลเวิลด์ สำโรง เท่านั้น\nวันที่ ${dateString}`;

        const textSvg = Buffer.from(
            `<svg width="800" height="600">
                <style>
                    .title { fill: rgba(255, 0, 0, 0.4); font-size: 50px; font-weight: bold; font-family: Arial; }
                </style>
                <text x="50%" y="50%" text-anchor="middle" class="title" transform="rotate(-20 400,300)">${watermarkText}</text>
            </svg>`
        );

        const watermarkedImageBuffer = await sharp(imageFile.buffer)
            .composite([{ input: textSvg, tile: false }])
            .jpeg({ quality: 80 })
            .toBuffer();

        // 4. Upload the watermarked image to Azure Blob Storage
        const connectionString = process.env.ReprintStorageConnectionString;
        if (!connectionString) {
            throw new Error("Azure Storage Connection String is not configured.");
        }
        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        const containerClient = blobServiceClient.getContainerClient("re-print-ids");

        const blobName = `${now.getFullYear()}/${month}/${day}/${requestId}.jpg`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);

        await blockBlobClient.upload(watermarkedImageBuffer, watermarkedImageBuffer.length, {
            blobHTTPHeaders: { blobContentType: "image/jpeg" }
        });

        // 5. Respond with success message and Request ID
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
