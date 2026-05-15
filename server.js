const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ================= CONFIGURAÇÃO =================
const PUSHINPAY_TOKEN = 'nbxYz2chBU8At3rs0OZndmUJpZxkTn6QGBQ2JsFg4ef23887'; 
const PUSHINPAY_API_URL = 'https://api.pushinpay.com.br/api/pix';
// ================================================

app.get('/', (req, res ) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/pix', async (req, res) => {
    try {
        const { payer_name, payer_document, amount } = req.body;

        // Valor em centavos
        const valueInCents = Math.round(parseFloat(amount) * 100);

        // Montando o payload com Nome/CPF reais e o resto padrão
        const payload = {
            value: valueInCents,
            webhook_url: '', 
            payer_name: payer_name,
            payer_document: payer_document,
            payer_email: 'cliente@email.com', // Dado padrão
            payer_phone: '11999999999'       // Dado padrão
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
        // Isso vai mostrar o erro real nos Logs do Render
        if (error.response) {
            console.error('ERRO PUSHINPAY:', error.response.data);
            res.status(500).json({ 
                success: false, 
                error: error.response.data.message || 'Erro na PushinPay' 
            });
        } else {
            console.error('ERRO:', error.message);
            res.status(500).json({ success: false, error: 'Erro interno.' });
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor ON'));
