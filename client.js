// Wait for the entire HTML document to be loaded before running the script
document.addEventListener('DOMContentLoaded', () => {

    // --- Element References ---
    const form = document.getElementById('reprintForm');
    const fileInput = document.getElementById('idCardImage');
    const canvas = document.getElementById('imageCanvas');
    const ctx = canvas.getContext('2d');
    
    // --- Cascading Dropdowns (Placeholder Data) ---
    // In the future, this data will come from your TH_LOC.ods file via an API
    const locationData = {
        "สมุทรปราการ": {
            "เมืองสมุทรปราการ": ["ปากน้ำ", "สำโรงเหนือ", "บางเมือง"],
            "พระประแดง": ["ตลาด", "บางพึ่ง", "บางครุ"]
        },
        "กรุงเทพมหานคร": {
            "เขตพระนคร": ["พระบรมมหาราชวัง", "วังบูรพาภิรมย์"],
            "เขตบางนา": ["บางนาเหนือ", "บางนาใต้"]
        }
    };

    const provinceSelect = document.getElementById('province');
    const districtSelect = document.getElementById('district');
    const subdistrictSelect = document.getElementById('subdistrict');

    // Populate initial provinces
    for (const province in locationData) {
        const option = document.createElement('option');
        option.value = province;
        option.textContent = province;
        provinceSelect.appendChild(option);
    }

    // Handle province change
    provinceSelect.addEventListener('change', () => {
        const selectedProvince = provinceSelect.value;
        // Clear previous options
        districtSelect.innerHTML = '<option value="">-- กรุณาเลือกอำเภอ --</option>';
        subdistrictSelect.innerHTML = '<option value="">-- กรุณาเลือกตำบล --</option>';

        if (selectedProvince && locationData[selectedProvince]) {
            for (const district in locationData[selectedProvince]) {
                const option = document.createElement('option');
                option.value = district;
                option.textContent = district;
                districtSelect.appendChild(option);
            }
        }
    });

    // Handle district change
    districtSelect.addEventListener('change', () => {
        const selectedProvince = provinceSelect.value;
        const selectedDistrict = districtSelect.value;
        // Clear previous options
        subdistrictSelect.innerHTML = '<option value="">-- กรุณาเลือกตำบล --</option>';

        if (selectedProvince && selectedDistrict && locationData[selectedProvince][selectedDistrict]) {
            locationData[selectedProvince][selectedDistrict].forEach(subdistrict => {
                const option = document.createElement('option');
                option.value = subdistrict;
                option.textContent = subdistrict;
                subdistrictSelect.appendChild(option);
            });
        }
    });


    // --- Image Preview & Watermark ---
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Resize canvas to match image aspect ratio
                const maxWidth = form.clientWidth * 0.9; // Max width is 90% of form width
                const scale = maxWidth / img.width;
                canvas.width = maxWidth;
                canvas.height = img.height * scale;

                // Draw the image
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                // --- Draw the Watermark ---
                const today = new Date();
                const dateString = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear() + 543}`;
                const watermarkText1 = "ใช้สำหรับ RE-PRINT บัตรจอดรถ";
                const watermarkText2 = `ที่ศูนย์การค้าอิมพีเรียลเวิลด์ สำโรง เท่านั้น`;
                const watermarkText3 = `วันที่ ${dateString}`;

                // Watermark styling
                ctx.font = `bold ${canvas.width / 20}px Arial`;
                ctx.fillStyle = 'rgba(255, 0, 0, 0.4)';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                // Rotate and draw the watermark
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.rotate(-20 * Math.PI / 180); // Rotate by -20 degrees
                
                ctx.fillText(watermarkText1, 0, -30);
                ctx.fillText(watermarkText2, 0, 0);
                ctx.fillText(watermarkText3, 0, 30);
                
                // Reset transformation
                ctx.rotate(20 * Math.PI / 180);
                ctx.translate(-canvas.width / 2, -canvas.height / 2);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });

    // --- Form Submission ---
    form.addEventListener('submit', (event) => {
        event.preventDefault(); // Prevent default browser submission
        
        // TODO: In the future, we will send this data to our backend API.
        // For now, we just show a success message.
        
        const formData = new FormData(form);
        
        // Log data to console for testing
        console.log("--- Form Data ---");
        for (const [key, value] of formData.entries()) {
            console.log(`${key}: ${value.name || value}`);
        }
        
        alert("ส่งข้อมูลสำเร็จ!\nRequest ID: (จะได้รับจากหลังบ้านในอนาคต)");
        form.reset();
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    });

});
