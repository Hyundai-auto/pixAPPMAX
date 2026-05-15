const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Configuração de CORS robusta
app.use(cors({
    origin: '*', // Permite requisições de qualquer lugar
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const PUSHINPAY_API_URL = 'https://api.pushinpay.com.br/api/pix/cash-in';

app.post('/api/pix', async (req, res ) => {
    try {
        const { payer_name, payer_document, amount } = req.body;
        const PUSHINPAY_TOKEN = process.env.PUSHINPAY_TOKEN;

        if (!PUSHINPAY_TOKEN) {
            return res.status(500).json({ success: false, error: 'Token da API não configurado no Render.' });
        }

        const valueInCents = Math.round(parseFloat(amount) * 100);

        const payload = {
            value: valueInCents,
            webhook_url: process.env.WEBHOOK_URL || '',
        };

        const response = await axios.post(PUSHINPAY_API_URL, payload, {
            headers: {
                'Authorization': `Bearer ${PUSHINPAY_TOKEN}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        res.json({
            success: true,
            pixCode: response.data.qr_code,
            qr_code_base64: response.data.qr_code_base64
        });

    } catch (error) {
        console.error('Erro:', error.response?.data || error.message);
        res.status(500).json({ 
            success: false, 
            error: error.response?.data?.message || 'Erro ao processar PIX.' 
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor ON na porta ${PORT}`));
