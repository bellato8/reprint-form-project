const { BlobServiceClient } = require("@azure/storage-blob");
const formidable = require("formidable");
const sharp = require("sharp");
const fs = require("fs");

// Helper function to parse form with Formidable
const parseForm = (req) => {
    return new Promise((resolve, reject) => {
        // THE FIX IS HERE: We instantiate the form object differently
        const form = formidable({ 
            // Options can be added here if needed, e.g., maxFileSize
        });

        form.parse(req, (err, fields, files) => {
            if (err) {
                reject(err);
                return;
            }
            // Formidable v3 wraps fields in arrays, so we need to unwrap them
            const unwrappedFields = {};
            for (const key in fields) {
                unwrappedFields[key] = fields[key][0];
            }
            resolve({ fields: unwrappedFields, files });
        });
    });
};

module.exports = async function (context, req) {
    context.log('Processing a new reprint request with Formidable parser v2.');

    try {
        const { fields, files } = await parseForm(req);

        const imageFile = files.file ? files.file[0] : null;
        if (!imageFile) {
            throw new Error("Image file not found in form data.");
        }

        const imageBuffer = fs.readFileSync(imageFile.filepath);

        // Generate Request ID
        const now = new Date();
        const year = now.getFullYear() + 543;
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const timestamp = Date.now().toString().slice(-4);
        const requestId = `R${year}${month}${day}-${timestamp}`;

        // Watermark the image
        const timeString = now.toTimeString().split(' ')[0].substring(0, 5);
        const dateString = `${day}/${month}/${year}`;
        const watermarkText = `ใช้สำหรับ RE-PRINT บัตรจอดรถเท่านั้น\nที่ศูนย์การค้าอิมพีเรียลเวิลด์ สำโรง\nวันที่ ${dateString} เวลา ${timeString} น.`;

        const imageMetadata = await sharp(imageBuffer).metadata();
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

        const watermarkedImageBuffer = await sharp(imageBuffer)
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

        // Respond with success
        context.res = {
            status: 200,
            body: `Submission successful! Your Request ID is: ${requestId}`
        };

    } catch (error) {
        context.log.error("Error in function:", error);
        context.res = {
            status: 500,
            body: "An error occurred: " + error.message
        };
    }
};
