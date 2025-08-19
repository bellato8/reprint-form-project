const { BlobServiceClient } = require("@azure/storage-blob");
const formidable = require("formidable");
const sharp = require("sharp");
const fs = require("fs");
const { Connection, Request, TYPES } = require("tedious");

const parseForm = (req) => {
    return new Promise((resolve, reject) => {
        const form = new formidable.IncomingForm();
        form.parse(req, (err, fields, files) => {
            if (err) return reject(err);
            const unwrappedFields = {};
            for (const key in fields) {
                if (Array.isArray(fields[key])) unwrappedFields[key] = fields[key][0];
                else unwrappedFields[key] = fields[key];
            }
            resolve({ fields: unwrappedFields, files });
        });
    });
};

const executeSql = (connection, request) => {
    return new Promise((resolve, reject) => {
        request.on('requestCompleted', () => resolve());
        request.on('error', err => reject(err));
        connection.execSql(request);
    });
};

module.exports = async function (context, req) {
    context.log('Processing a new reprint request with DB insert.');
    let connection;
    try {
        const { fields, files } = await parseForm(req);
        const imageFile = files.file ? (Array.isArray(files.file) ? files.file[0] : files.file) : null;
        if (!imageFile) throw new Error("Image file not found in form data.");

        const imageBuffer = fs.readFileSync(imageFile.filepath);

        // --- Generate Request ID ---
        const now = new Date();
        const year = now.getFullYear() + 543;
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const timestamp = Date.now().toString().slice(-4);
        const requestId = `R${year}${month}${day}-${timestamp}`;

        // --- Watermark Image ---
        const timeString = now.toTimeString().split(' ')[0].substring(0, 5);
        const dateString = `${day}/${month}/${year}`;
        const watermarkText = `ใช้สำหรับ RE-PRINT บัตรจอดรถเท่านั้น\nที่ศูนย์การค้าอิมพีเรียลเวิลด์ สำโรง\nวันที่ ${dateString} เวลา ${timeString} น.`;
        const imageMetadata = await sharp(imageBuffer).metadata();
        const textSvg = Buffer.from(`<svg width="${imageMetadata.width}" height="${imageMetadata.height}"><style>.title { fill: rgba(255, 0, 0, 0.4); font-size: ${Math.max(20, imageMetadata.width / 20)}px; font-weight: bold; font-family: Arial, sans-serif; text-anchor: middle; }</style><text x="50%" y="50%" class="title" transform="rotate(-20 ${imageMetadata.width / 2},${imageMetadata.height / 2})">${watermarkText.split('\n').map((line, i) => `<tspan x="50%" dy="${i === 0 ? 0 : '1.2em'}">${line}</tspan>`).join('')}</text></svg>`);
        const watermarkedImageBuffer = await sharp(imageBuffer).composite([{ input: textSvg, tile: false }]).jpeg({ quality: 85 }).toBuffer();

        // --- Upload to Azure Blob Storage ---
        const storageConnectionString = process.env.ReprintStorageConnectionString;
        if (!storageConnectionString) throw new Error("Azure Storage Connection String is not configured.");
        const blobServiceClient = BlobServiceClient.fromConnectionString(storageConnectionString);
        const containerClient = blobServiceClient.getContainerClient("re-print-ids");
        const blobName = `${now.getFullYear()}/${month}/${day}/${requestId}.jpg`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        await blockBlobClient.upload(watermarkedImageBuffer, watermarkedImageBuffer.length, { blobHTTPHeaders: { blobContentType: "image/jpeg" } });

        // --- Save to SQL Database ---
        const sqlConnectionString = process.env.SqlConnectionString;
        if (!sqlConnectionString) throw new Error("SQL Database Connection String is not configured.");

        connection = new Connection({
            server: sqlConnectionString.match(/Server=tcp:([^,]+)/)[1],
            authentication: { type: 'default', options: { userName: sqlConnectionString.match(/User ID=([^;]+)/)[1], password: sqlConnectionString.match(/Password=([^;]+)/)[1] }},
            options: { database: sqlConnectionString.match(/Initial Catalog=([^;]+)/)[1], encrypt: true }
        });

        await new Promise(resolve => connection.on('connect', err => { if (err) throw err; resolve(); }));

        const sql = `INSERT INTO Requests (RequestId, Timestamp, FullName, Age, Phone, Province, District, Subdistrict, ApplicantRole, VehicleType, Brand, Model, Color, LicensePlate, Gate, ReasonType, ReasonOther, ConsentAgreed, IdImageFileId) 
                     VALUES (@RequestId, @Timestamp, @FullName, @Age, @Phone, @Province, @District, @Subdistrict, @ApplicantRole, @VehicleType, @Brand, @Model, @Color, @LicensePlate, @Gate, @ReasonType, @ReasonOther, @ConsentAgreed, @IdImageFileId)`;

        const request = new Request(sql, err => { if (err) throw err; });
        request.addParameter('RequestId', TYPES.NVarChar, requestId);
        request.addParameter('Timestamp', TYPES.DateTimeOffset, now);
        request.addParameter('FullName', TYPES.NVarChar, fields.FullName);
        request.addParameter('Age', TYPES.Int, fields.Age ? parseInt(fields.Age) : null);
        request.addParameter('Phone', TYPES.VarChar, fields.Phone);
        request.addParameter('Province', TYPES.NVarChar, fields.Province);
        request.addParameter('District', TYPES.NVarChar, fields.District);
        request.addParameter('Subdistrict', TYPES.NVarChar, fields.Subdistrict);
        request.addParameter('ApplicantRole', TYPES.NVarChar, fields.ApplicantRole);
        request.addParameter('VehicleType', TYPES.NVarChar, fields.VehicleType);
        request.addParameter('Brand', TYPES.NVarChar, fields.Brand);
        request.addParameter('Model', TYPES.NVarChar, fields.Model);
        request.addParameter('Color', TYPES.NVarChar, fields.Color);
        request.addParameter('LicensePlate', TYPES.NVarChar, fields.LicensePlate);
        request.addParameter('Gate', TYPES.NVarChar, fields.Gate);
        request.addParameter('ReasonType', TYPES.NVarChar, fields.ReasonType);
        request.addParameter('ReasonOther', TYPES.NVarChar, fields.ReasonOther);
        request.addParameter('ConsentAgreed', TYPES.Bit, fields.ConsentAgreed === 'on');
        request.addParameter('IdImageFileId', TYPES.NVarChar, blobName);

        await executeSql(connection, request);

        // --- Respond with success ---
        context.res = {
            status: 200,
            body: `Submission successful! Your Request ID is: ${requestId}. Data has been saved to the database.`
        };

    } catch (error) {
        context.log.error("Error in function:", error);
        context.res = { status: 500, body: "An error occurred: " + error.message };
    } finally {
        if (connection && connection.closed) {
            connection.close();
        }
    }
};