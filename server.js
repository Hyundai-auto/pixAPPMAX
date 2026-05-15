const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Serve arquivos estáticos da pasta 'public'
app.use(express.static('public'));

const PUSHINPAY_API_URL = 'https://api.pushinpay.com.br/api/pix/cash-in';
const PUSHINPAY_TOKEN = process.env.PUSHINPAY_TOKEN;

app.post('/api/pix', async (req, res ) => {
    try {
        const { payer_name, payer_document, amount } = req.body;

        if (!payer_name || !payer_document || !amount) {
            return res.status(400).json({ success: false, error: 'Campos obrigatórios ausentes.' });
        }

        // Converte valor para centavos (ex: 10.50 -> 1050)
        const valueInCents = Math.round(parseFloat(amount) * 100);

        const payload = {
            value: valueInCents,
            webhook_url: process.env.WEBHOOK_URL || 'https://seusite.com/webhook',
        };

        const response = await axios.post(PUSHINPAY_API_URL, payload, {
            headers: {
                'Authorization': `Bearer ${PUSHINPAY_TOKEN}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        } );

        if (response.data && response.data.qr_code) {
            res.json({
                success: true,
                pixCode: response.data.qr_code,
                qr_code_base64: response.data.qr_code_base64
            });
        } else {
            res.status(500).json({ success: false, error: 'Falha ao gerar QR Code na PushinPay.' });
        }

    } catch (error) {
        console.error('Erro na integração PushinPay:', error.response ? error.response.data : error.message);
        res.status(500).json({ 
            success: false, 
            error: error.response?.data?.message || 'Erro interno no servidor.' 
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
