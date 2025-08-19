document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('reprintForm');
    const fileInput = document.getElementById('idCardImage');
    const canvas = document.getElementById('imageCanvas');
    const ctx = canvas.getContext('2d');
    const submitButton = form.querySelector('button[type="submit"]');
    let processedFile = null;

    // --- NEW: Real Cascading Dropdowns ---
    const provinceSelect = document.getElementById('province');
    const districtSelect = document.getElementById('district');
    const subdistrictSelect = document.getElementById('subdistrict');

    // Function to populate a select dropdown
    const populateSelect = (selectElement, items) => {
        selectElement.innerHTML = `<option value="">-- ${selectElement.id === 'province' ? 'กรุณาเลือกจังหวัด' : (selectElement.id === 'district' ? 'กรุณาเลือกอำเภอ' : 'กรุณาเลือกตำบล')} --</option>`;
        items.forEach(item => {
            const option = document.createElement('option');
            option.value = item;
            option.textContent = item;
            selectElement.appendChild(option);
        });
    };

    // 1. Fetch and populate provinces on page load
    fetch('/api/locations')
        .then(response => response.json())
        .then(provinces => populateSelect(provinceSelect, provinces));

    // 2. Add event listener for province change
    provinceSelect.addEventListener('change', () => {
        const selectedProvince = provinceSelect.value;
        districtSelect.innerHTML = '<option value="">-- กำลังโหลด... --</option>';
        subdistrictSelect.innerHTML = '<option value="">-- กรุณาเลือกตำบล --</option>';

        if (selectedProvince) {
            fetch(`/api/locations?province=${encodeURIComponent(selectedProvince)}`)
                .then(response => response.json())
                .then(districts => populateSelect(districtSelect, districts));
        } else {
             populateSelect(districtSelect, []);
        }
    });

    // 3. Add event listener for district change
    districtSelect.addEventListener('change', () => {
        const selectedDistrict = districtSelect.value;
        subdistrictSelect.innerHTML = '<option value="">-- กำลังโหลด... --</option>';

        if (selectedDistrict) {
             fetch(`/api/locations?district=${encodeURIComponent(selectedDistrict)}`)
                .then(response => response.json())
                .then(subdistricts => populateSelect(subdistrictSelect, subdistricts));
        } else {
            populateSelect(subdistrictSelect, []);
        }
    });

    // --- Image Preview & Watermark ---
    fileInput.addEventListener('change', async (event) => {
        // ... (โค้ดส่วนนี้เหมือนเดิมทุกประการ) ...
        let file = event.target.files[0];
        if (!file) { processedFile = null; return; }
        submitButton.disabled = true;
        submitButton.textContent = 'กำลังประมวลผลรูป...';
        try {
            const fileName = file.name.toLowerCase();
            if (fileName.endsWith('.heic') || fileName.endsWith('.heif')) {
                const convertedBlob = await heic2any({ blob: file, toType: "image/jpeg" });
                processedFile = new File([convertedBlob], "converted.jpeg", { type: "image/jpeg" });
            } else {
                processedFile = file;
            }
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
                    const timeString = today.toTimeString().split(' ')[0].substring(0, 5);
                    const dateString = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear() + 543}`;
                    const watermarkText = `ใช้สำหรับ RE-PRINT บัตรจอดรถเท่านั้น\nที่ศูนย์การค้าอิมพีเรียลเวิลด์ สำโรง\nวันที่ ${dateString} เวลา ${timeString} น.`;
                    ctx.font = `bold ${canvas.width / 25}px Arial`;
                    ctx.fillStyle = 'rgba(255, 0, 0, 0.4)';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.translate(canvas.width / 2, canvas.height / 2);
                    ctx.rotate(-20 * Math.PI / 180);
                    const lines = watermarkText.split('\n');
                    const lineHeight = canvas.width / 20;
                    lines.forEach((line, index) => {
                        ctx.fillText(line, 0, (index * lineHeight) - (lineHeight * (lines.length - 1) / 2));
                    });
                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(processedFile);
        } catch (error) {
            alert("เกิดข้อผิดพลาดในการประมวลผลรูปภาพ");
            processedFile = null;
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'ส่งคำร้อง';
        }
    });

    // --- Form Submission ---
    form.addEventListener('submit', async (event) => {
        // ... (โค้ดส่วนนี้เหมือนเดิมทุกประการ) ...
        event.preventDefault();
        if (!processedFile) {
            alert('กรุณาอัปโหลดรูปภาพก่อนครับ');
            return;
        }
        submitButton.disabled = true;
        submitButton.textContent = 'กำลังส่ง...';
        const reader = new FileReader();
        reader.readAsDataURL(processedFile);
        reader.onload = async () => {
            const base64Image = reader.result;
            const formDataObject = {};
            new FormData(form).forEach((value, key) => {
                if (key !== 'file') {
                    formDataObject[key] = value;
                }
            });
            const payload = { ...formDataObject, imageData: base64Image, imageFileName: processedFile.name };
            try {
                const response = await fetch('/api/requests', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                const responseText = await response.text();
                if (response.ok) {
                    alert('ส่งข้อมูลสำเร็จ! ข้อความตอบกลับ:\n\n' + responseText);
                    form.reset();
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    processedFile = null;
                    fileInput.value = '';
                } else {
                    throw new Error('Server error: ' + responseText);
                }
            } catch (error) {
                alert('เกิดข้อผิดพลาดในการส่งข้อมูล: ' + error.message);
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = 'ส่งคำร้อง';
            }
        };
        reader.onerror = (error) => {
            alert('เกิดข้อผิดพลาดในการอ่านไฟล์รูปภาพ');
            submitButton.disabled = false;
            submitButton.textContent = 'ส่งคำร้อง';
        };
    });
});
