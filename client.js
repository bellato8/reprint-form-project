// Wait for the entire HTML document to be loaded before running the script
document.addEventListener('DOMContentLoaded', () => {

    // --- Element References ---
    const form = document.getElementById('reprintForm');
    const fileInput = document.getElementById('idCardImage');
    const canvas = document.getElementById('imageCanvas');
    const ctx = canvas.getContext('2d');
    const submitButton = form.querySelector('button[type="submit"]');

    // --- Cascading Dropdowns (Placeholder Data) ---
    const locationData = {
        "สมุทรปราการ": { "เมืองสมุทรปราการ": ["ปากน้ำ", "สำโรงเหนือ"], "พระประแดง": ["ตลาด", "บางพึ่ง"] },
        "กรุงเทพมหานคร": { "เขตพระนคร": ["พระบรมมหาราชวัง"], "เขตบางนา": ["บางนาเหนือ", "บางนาใต้"] }
    };
    const provinceSelect = document.getElementById('province');
    const districtSelect = document.getElementById('district');
    const subdistrictSelect = document.getElementById('subdistrict');
    for (const province in locationData) {
        provinceSelect.add(new Option(province, province));
    }
    provinceSelect.addEventListener('change', () => {
        districtSelect.innerHTML = '<option value="">-- กรุณาเลือกอำเภอ --</option>';
        subdistrictSelect.innerHTML = '<option value="">-- กรุณาเลือกตำบล --</option>';
        if (provinceSelect.value && locationData[provinceSelect.value]) {
            for (const district in locationData[provinceSelect.value]) {
                districtSelect.add(new Option(district, district));
            }
        }
    });
    districtSelect.addEventListener('change', () => {
        subdistrictSelect.innerHTML = '<option value="">-- กรุณาเลือกตำบล --</option>';
        const districts = locationData[provinceSelect.value];
        if (districtSelect.value && districts && districts[districtSelect.value]) {
            districts[districtSelect.value].forEach(subdistrict => {
                subdistrictSelect.add(new Option(subdistrict, subdistrict));
            });
        }
    });

    // --- Image Preview & Watermark ---
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const maxWidth = form.clientWidth > 0 ? form.clientWidth * 0.9 : 300;
                const scale = maxWidth / img.width;
                canvas.width = maxWidth;
                canvas.height = img.height * scale;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                const today = new Date();
                const dateString = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear() + 543}`;
                const watermarkText1 = "ใช้สำหรับ RE-PRINT บัตรจอดรถ";
                const watermarkText2 = `ที่ศูนย์การค้าอิมพีเรียลเวิลด์ สำโรง เท่านั้น`;
                const watermarkText3 = `วันที่ ${dateString}`;

                ctx.font = `bold ${canvas.width / 22}px Arial`;
                ctx.fillStyle = 'rgba(255, 0, 0, 0.4)';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.rotate(-20 * Math.PI / 180);
                ctx.fillText(watermarkText1, 0, -30);
                ctx.fillText(watermarkText2, 0, 0);
                ctx.fillText(watermarkText3, 0, 30);
                ctx.setTransform(1, 0, 0, 1, 0, 0);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });

    // --- Form Submission ---
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        submitButton.disabled = true;
        submitButton.textContent = 'กำลังส่ง...';

        const formData = new FormData(form);

        try {
            const response = await fetch('/api/requests', {
                method: 'POST',
                body: formData,
            });

            const responseText = await response.text();

            if (response.ok) {
                alert('ส่งข้อมูลสำเร็จ! ข้อความตอบกลับจากหลังบ้าน:\n\n' + responseText);
                form.reset();
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            } else {
                throw new Error('Server error: ' + responseText);
            }

        } catch (error) {
            console.error('Error submitting form:', error);
            alert('เกิดข้อผิดพลาดในการส่งข้อมูล: ' + error.message);
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'ส่งคำร้อง';
        }
    });
});
