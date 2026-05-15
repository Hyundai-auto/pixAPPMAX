const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ================= CONFIGURAÇÃO =================
const PUSHINPAY_TOKEN = '66379|nbxYz2chBU8At3rs0OZndmUJpZxkTn6QGBQ2JsFg4ef23887'; 
// Verifique se o link abaixo está correto conforme sua conta
const PUSHINPAY_API_URL = 'https://api.pushinpay.com.br/api/pix/cash-in';
// ================================================

app.get('/', (req, res ) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/pix', async (req, res) => {
    console.log('--- Nova tentativa de PIX ---');
    try {
        const { payer_name, payer_document, amount } = req.body;
        
        // Validação básica de valor
        if (!amount || parseFloat(amount) < 0.50) {
            console.error('Erro: Valor abaixo do mínimo de R$ 0,50');
            return res.status(400).json({ success: false, error: 'Valor mínimo é R$ 0,50' });
        }

        const valueInCents = Math.round(parseFloat(amount) * 100);
        
        const payload = {
            value: valueInCents,
            webhook_url: '', // Opcional
            // Se a sua conta exigir nome/cpf no PIX, eles entram aqui:
            // payer_name: payer_name,
            // payer_document: payer_document
        };

        console.log('Enviando para PushinPay:', payload);

        const response = await axios.post(PUSHINPAY_API_URL, payload, {
            headers: {
                'Authorization': `Bearer ${PUSHINPAY_TOKEN}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        console.log('Sucesso PushinPay:', response.data.id);

        res.json({
            success: true,
            pixCode: response.data.qr_code,
            qr_code_base64: response.data.qr_code_base64
        });

    } catch (error) {
        // LOG DETALHADO PARA VOCÊ VER NO RENDER
        if (error.response) {
            console.error('ERRO PUSHINPAY:', error.response.status, error.response.data);
            res.status(500).json({ 
                success: false, 
                error: error.response.data.message || 'Erro na PushinPay' 
            });
        } else {
            console.error('ERRO DE CONEXÃO:', error.message);
            res.status(500).json({ success: false, error: 'Erro de conexão com a API.' });
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
