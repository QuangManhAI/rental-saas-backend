
const axios = require('axios');
const crypto = require('crypto');

async function testMomo() {
    const partnerCode = process.env.MOMO_PARTNER_CODE || 'MOMOBKUN20180529';
    const accessKey = process.env.MOMO_ACCESS_KEY || 'klm05TvNBzhg7h7j';
    const secretKey = process.env.MOMO_SECRET_KEY || 'at67qH6mk8w5Y1nAyMoYKMWACiEi2bsa';
    const endpoint = 'https://test-payment.momo.vn/v2/gateway/api/create';

    const orderId = `TEST_${Date.now()}`;
    const requestId = orderId;
    const amount = '50000';
    const orderInfo = 'Thanh toan test Bill';
    const redirectUrl = 'http://localhost:3000/payment/result';
    const ipnUrl = 'http://localhost:3000/momo/ipn';
    const extraData = '';
    const requestType = 'captureWallet';

    const rawSignature = [
        `accessKey=${accessKey}`,
        `amount=${amount}`,
        `extraData=${extraData}`,
        `ipnUrl=${ipnUrl}`,
        `orderId=${orderId}`,
        `orderInfo=${orderInfo}`,
        `partnerCode=${partnerCode}`,
        `redirectUrl=${redirectUrl}`,
        `requestId=${requestId}`,
        `requestType=${requestType}`,
    ].join('&');

    const signature = crypto.createHmac('sha256', secretKey).update(rawSignature).digest('hex');

    const requestBody = {
        partnerCode,
        accessKey,
        requestId,
        amount,
        orderId,
        orderInfo,
        redirectUrl,
        ipnUrl,
        extraData,
        requestType,
        signature,
        lang: 'vi',
    };

    console.log('Sending request to MoMo:', JSON.stringify(requestBody, null, 2));

    try {
        const response = await axios.post(endpoint, requestBody);
        console.log('Response:', response.data);
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

testMomo();
