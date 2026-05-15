const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();

// Configuração de CORS para permitir requisições do seu frontend
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ================= CONFIGURAÇÃO MANUAL =================
const PUSHINPAY_TOKEN = 'COLOQUE_SEU_TOKEN_AQUI_DENTRO_DAS_ASPAS';
const PUSHINPAY_API_URL = 'https://api.pushinpay.com.br/api/pix/cash-in';
// =======================================================

app.post('/api/pix', async (req, res ) => {
    try {
        const { payer_name, payer_document, amount } = req.body;

        if (!payer_name || !payer_document || !amount) {
            return res.status(400).json({ success: false, error: 'Campos obrigatórios ausentes.' });
        }

        // Converte valor para centavos
        const valueInCents = Math.round(parseFloat(amount) * 100);

        const payload = {
            value: valueInCents,
            webhook_url: '', // Opcional: coloque sua URL de webhook aqui se tiver
        };

        const response = await axios.post(PUSHINPAY_API_URL, payload, {
            headers: {
                'Authorization': `Bearer ${PUSHINPAY_TOKEN}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (response.data && response.data.qr_code) {
            res.json({
                success: true,
                pixCode: response.data.qr_code,
                qr_code_base64: response.data.qr_code_base64
            });
        } else {
            res.status(500).json({ success: false, error: 'Resposta inválida da PushinPay.' });
        }

    } catch (error) {
        console.error('Erro na integração:', error.response ? error.response.data : error.message);
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
