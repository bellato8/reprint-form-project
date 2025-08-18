module.exports = async function (context, req) {
    context.log('JavaScript HTTP trigger function processed a request.');

    // ส่งข้อความตอบกลับไปหาคนที่เรียก API นี้
    context.res = {
        // status: 200, // สถานะ "สำเร็จ" (เป็นค่าเริ่มต้นอยู่แล้ว)
        body: "Hello from the backend! Your request was received."
    };
}
