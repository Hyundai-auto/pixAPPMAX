const express = require("express");
const axios = require("axios");
const cookieParser = require("cookie-parser");
const path = require("path");
const crypto = require("crypto");

try {
  require("dotenv").config();
} catch (e) {
  console.log("Aviso: dotenv não carregado.");
}

const app = express();
const PORT = process.env.PORT || 3000;
const APPMAX_PL = process.env.APPMAX_PL || "9d75397acf";

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Cookie, X-Requested-With");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const axiosInstance = axios.create({
  baseURL: "https://pay.finaliza.shop",
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Origin": "https://pay.finaliza.shop",
    "Accept": "application/json, text/plain, */*",
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

function generateHighlyVariableGmailFromCpf(cpf) {
  const firstNames = ["gabriel", "lucas", "mateus", "felipe", "rafael", "bruno", "thiago", "vinicius", "rodrigo", "andre", "julia", "fernanda", "beatriz", "larissa", "camila", "amanda", "leticia", "mariana", "carolina", "isabela"];
  const lastNames = ["silva", "santos", "oliveira", "souza", "rodrigues", "ferreira", "alves", "pereira", "lima", "gomes", "costa", "ribeiro", "martins", "carvalho", "almeida", "lopes", "soares", "fernandes", "vieira", "barbosa"];

  const cleanCpf = (cpf || "").replace(/\D/g, "");
  const seed = cleanCpf ? parseInt(crypto.createHash("md5").update(cleanCpf).digest("hex").substring(0, 8), 16) : Math.floor(Math.random() * 1000000);
  
  const firstName = firstNames[seed % firstNames.length].substring(0, 2);
  const fullLastName = lastNames[(seed >> 2) % lastNames.length];
  const lastName = fullLastName.substring(0, 2) + fullLastName.slice(-1);
  
  const suffixCpf = cleanCpf.substring(8, 11) || String(Math.floor(Math.random() * 900 + 100));
  const randomNum = Math.floor(Math.random() * 900 + 100);
  const shortNum = Math.floor(Math.random() * 90 + 10);

  const formats = [
    `${firstName}.${lastName}${randomNum}`,
    `${lastName}${firstName}${suffixCpf}`,
    `${firstName}_${lastName}${shortNum}`,
    `${lastName}.${firstName}${randomNum}`,
    `${firstName}${lastName}${suffixCpf}${shortNum}`,
    `${lastName}_${firstName}${randomNum}`,
    `${firstName}${randomNum}${lastName}`,
    `${lastName}${shortNum}${firstName}`,
    `${firstName}.${lastName}.${suffixCpf}`,
    `${lastName}_${firstName}_${shortNum}`,
    `${firstName}${lastName}${randomNum}${shortNum}`
  ];
  
  const selectedFormat = formats[seed % formats.length].replace(/\s/g, ".");
  return `${selectedFormat}@gmail.com`.toLowerCase();
}

app.post("/proxy/pix", async (req, res) => {
  console.log("--- Nova requisição PIX (Appmax) ---");
  const { payer_name, payer_email, amount, payer_cpf, payer_phone } = req.body;

  if (!payer_name || !payer_cpf) {
    return res.status(400).json({ error: "Nome e CPF são obrigatórios." });
  }

  try {
    const finalEmail = (!payer_email || payer_email === "nao@informado.com") 
      ? generateHighlyVariableGmailFromCpf(payer_cpf)
      : payer_email;
    
    const finalPhone = payer_phone || "11999999999";
    const cleanCpf = payer_cpf.replace(/\D/g, "");

    // 1. Identificar o cliente e obter o hash do carrinho
    // O hash do carrinho parece ser fixo ou gerado na primeira requisição. 
    // No teste foi '209976e514eaef2e'. Vamos tentar usar o PL como base ou obter dinamicamente se necessário.
    // Para simplificar e garantir funcionamento, vamos primeiro tentar o fluxo direto.
    
    const cartHash = "209976e514eaef2e"; // Hash capturado do link pl=9d75397acf

    console.log("Passo 1: Identificar cliente");
    await axiosInstance.post("/api/v1/step/identify", {
      full_name: payer_name,
      email: finalEmail,
      telephone: finalPhone,
      ip: null,
      cart: cartHash
    });

    console.log("Passo 2: Criar pedido");
    const orderResponse = await axiosInstance.post("/api/v1/step/order/create", {
      payment_method: "Pix",
      cart: cartHash
    });

    const orderId = orderResponse.data.data.id;
    console.log("Order ID criado:", orderId);

    console.log("Passo 3: Gerar PIX");
    const pixResponse = await axiosInstance.post("/api/v1/step/payment/pix", {
      document: cleanCpf,
      cart: cartHash
    });

    if (pixResponse.data && pixResponse.data.data && pixResponse.data.data.pix_emv) {
      const pixCode = pixResponse.data.data.pix_emv;
      console.log("PIX gerado com sucesso.");
      return res.status(200).json({ success: true, pixCode: pixCode });
    } else {
      console.error("Resposta inesperada da Appmax:", pixResponse.data);
      return res.status(500).json({ error: "Erro ao gerar PIX na Appmax." });
    }

  } catch (err) {
    console.error("Erro no processamento Appmax:", err.response ? err.response.data : err.message);
    res.status(500).json({ 
      error: "Erro interno ao processar com Appmax", 
      details: err.response ? err.response.data : err.message 
    });
  }
});

app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));
app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`Servidor Appmax rodando na porta ${PORT}`));
