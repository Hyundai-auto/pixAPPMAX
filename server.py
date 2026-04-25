"""
Backend Flask para integração com a API Appmax (PIX).
Hospedado no Render. Serve o checkout HTML e expõe o endpoint /proxy/pix.

Fluxo Appmax:
  1. POST /oauth2/token  → obtém Bearer token (válido 1h)
  2. POST /v1/customers  → cria/atualiza cliente (retorna customer_id)
  3. POST /v1/orders     → cria pedido (retorna order_id)
  4. POST /v1/payments/pix → gera código EMV/QR Code
"""

import os
import uuid
import time
import threading
import requests
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder=".")
CORS(app)

# ─── CREDENCIAIS APPMAX (EDITE AQUI COM SUAS CREDENCIAIS) ────────────────────
APPMAX_CLIENT_ID     = "SEU_CLIENT_ID_AQUI"
APPMAX_CLIENT_SECRET = "SEU_CLIENT_SECRET_AQUI"
# ────────────────────────────────────────────────────────────────────────────

APPMAX_AUTH_URL      = "https://auth.appmax.com.br/oauth2/token"
APPMAX_API_URL       = "https://api.appmax.com.br"

# ─── Cache de token (evita gerar um novo a cada requisição) ──────────────────
_token_cache = {"token": None, "expires_at": 0}
_token_lock  = threading.Lock()


def get_access_token() -> str:
    """Retorna um Bearer token válido, renovando se necessário."""
    with _token_lock:
        now = time.time()
        if _token_cache["token"] and now < _token_cache["expires_at"] - 60:
            return _token_cache["token"]

        resp = requests.post(
            APPMAX_AUTH_URL,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "grant_type":    "client_credentials",
                "client_id":     APPMAX_CLIENT_ID,
                "client_secret": APPMAX_CLIENT_SECRET,
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        _token_cache["token"]      = data["access_token"]
        _token_cache["expires_at"] = now + data.get("expires_in", 3600)
        return _token_cache["token"]


def appmax_headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type":  "application/json",
        "Accept":        "application/json",
    }


# ─── Dados padronizados (usados quando a Appmax exige campos obrigatórios) ───
PADRAO_EMAIL    = "cliente@loja.com.br"
PADRAO_PHONE    = "11999999999"          # 11 dígitos, sem formatação
PADRAO_CPF      = "00000000000"          # CPF fictício para campos obrigatórios
PADRAO_IP       = "127.0.0.1"
PADRAO_SKU      = "PRODUTO-001"
PADRAO_PRODUTO  = "Produto"


@app.route("/proxy/pix", methods=["POST"])
def proxy_pix():
    """
    Recebe do frontend:
      { "payer_name": "João Silva", "amount": "89.47" }

    Executa o fluxo Appmax e retorna:
      { "success": true, "pixCode": "<emv_code>" }
    """
    body = request.get_json(force=True)
    payer_name: str = (body.get("payer_name") or "Cliente").strip()
    amount_str: str = str(body.get("amount", "0"))

    try:
        amount_float = float(amount_str)
    except ValueError:
        return jsonify({"success": False, "error": "Valor inválido"}), 400

    # Appmax trabalha com centavos (inteiros)
    amount_cents = int(round(amount_float * 100))

    # Separa primeiro e último nome (Appmax exige first_name + last_name)
    parts = payer_name.split()
    first_name = parts[0] if parts else "Cliente"
    last_name  = parts[-1] if len(parts) > 1 else "Sobrenome"

    try:
        token = get_access_token()
        hdrs  = appmax_headers(token)

        # ── 1. Criar/atualizar cliente ────────────────────────────────────
        customer_payload = {
            "first_name":      first_name,
            "last_name":       last_name,
            "email":           PADRAO_EMAIL,
            "phone":           PADRAO_PHONE,
            "document_number": PADRAO_CPF,
            "ip":              PADRAO_IP,
        }
        r_cust = requests.post(
            f"{APPMAX_API_URL}/v1/customers",
            headers=hdrs,
            json=customer_payload,
            timeout=15,
        )
        r_cust.raise_for_status()
        customer_id = r_cust.json()["data"]["customer"]["id"]

        # ── 2. Criar pedido ───────────────────────────────────────────────
        order_payload = {
            "customer_id":    customer_id,
            "products_value": amount_cents,
            "discount_value": 0,
            "shipping_value": 0,
            "products": [
                {
                    "sku":        PADRAO_SKU,
                    "name":       PADRAO_PRODUTO,
                    "quantity":   1,
                    "unit_value": amount_cents,
                    "type":       "digital",
                }
            ],
        }
        r_order = requests.post(
            f"{APPMAX_API_URL}/v1/orders",
            headers=hdrs,
            json=order_payload,
            timeout=15,
        )
        r_order.raise_for_status()
        order_id = r_order.json()["data"]["order"]["id"]

        # ── 3. Gerar PIX ──────────────────────────────────────────────────
        pix_payload = {
            "order_id": order_id,
            "payment_data": {
                "pix": {
                    "document_number": PADRAO_CPF,
                }
            },
        }
        r_pix = requests.post(
            f"{APPMAX_API_URL}/v1/payments/pix",
            headers=hdrs,
            json=pix_payload,
            timeout=15,
        )
        r_pix.raise_for_status()
        pix_data = r_pix.json()

        # A Appmax retorna o código EMV em data.payment.pix.emv (ou similar)
        emv_code = (
            pix_data.get("data", {})
                    .get("payment", {})
                    .get("pix", {})
                    .get("emv")
            or pix_data.get("data", {})
                       .get("pix", {})
                       .get("emv")
            or pix_data.get("emv")
            or pix_data.get("data", {})
                       .get("emv")
        )

        if not emv_code:
            # Tenta encontrar qualquer chave que contenha "emv" ou "code"
            import json as _json
            flat = _json.dumps(pix_data)
            app.logger.warning("Resposta PIX Appmax: %s", flat)
            return jsonify({"success": False, "error": "Código PIX não encontrado na resposta", "raw": pix_data}), 502

        return jsonify({"success": True, "pixCode": emv_code})

    except requests.HTTPError as exc:
        try:
            detail = exc.response.json()
        except Exception:
            detail = exc.response.text
        app.logger.error("Appmax HTTP error %s: %s", exc.response.status_code, detail)
        return jsonify({"success": False, "error": str(exc), "detail": detail}), 502

    except Exception as exc:
        app.logger.exception("Erro inesperado no proxy PIX")
        return jsonify({"success": False, "error": str(exc)}), 500


# ─── Serve o checkout HTML estático ─────────────────────────────────────────
@app.route("/")
def index():
    return send_from_directory(".", "index.html")


@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(".", filename)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
