const data = require('../th_locations.json');

module.exports = async function (context, req) {
    const province = req.query.province;
    const district = req.query.district;

    let responseData;

    if (district) {
        responseData = data.subdistricts[district] || [];
    } else if (province) {
        responseData = data.districts[province] || [];
    } else {
        responseData = data.provinces;
    }

    context.res = {
        headers: { 'Content-Type': 'application/json' },
        body: responseData
    };
};
