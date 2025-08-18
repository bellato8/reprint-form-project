module.exports = async function (context, req) {
    context.log('JavaScript HTTP trigger function processed a request.');

    // ตรวจสอบว่า request ที่ส่งมาเป็นประเภท POST หรือไม่
    if (req.method === "POST") {
        // ในอนาคตเราจะใส่โค้ดประมวลผลข้อมูลและรูปภาพตรงนี้
        // ตอนนี้แค่ส่งข้อความยืนยันกลับไปก่อน
        context.res = {
            body: "Backend received your POST request successfully! Data processing is next."
        };
    } else {
        // ถ้าไม่ใช่ POST ให้ส่งข้อความผิดพลาดกลับไป
        context.res = {
            status: 400,
            body: "Please use the form to submit a POST request."
        };
    }
}
