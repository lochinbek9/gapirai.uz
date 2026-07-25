import hashlib
import math
import time
from decimal import Decimal, ROUND_HALF_UP
from urllib.parse import urlencode

TEST_PRICE_MULTIPLIER = Decimal("0.1")

class ClickErrors:
    SUCCESS = 0
    SIGN_CHECK_FAILED = -1
    INVALID_AMOUNT = -2
    ACTION_NOT_FOUND = -3
    ALREADY_PAID = -4
    USER_NOT_FOUND = -5
    TRANSACTION_NOT_FOUND = -6
    FAILED_TO_UPDATE = -7
    ERROR_IN_REQUEST = -8
    TRANSACTION_CANCELLED = -9

CLICK_BASE_URL = 'https://my.click.uz/services/pay'


def normalize_uzs_amount(amount: Decimal | float | int | str) -> int:
    normalized = Decimal(str(amount)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return int(normalized)

def generate_digest(timestamp: int, secret_key: str) -> str:
    data = f"{timestamp}{secret_key}"
    return hashlib.sha1(data.encode('utf-8')).hexdigest()

def generate_payment_url(
    merchant_id: str,
    service_id: str,
    transaction_param: str,
    amount: Decimal | float | int | str,
    return_url: str,
) -> str:
    params = {
        'service_id': service_id,
        'merchant_id': merchant_id,
        'amount': str(normalize_uzs_amount(amount)),
        'transaction_param': transaction_param,
        'return_url': return_url,
    }
    return f"{CLICK_BASE_URL}?{urlencode(params)}"

def validate_signature(params: dict, secret_key: str) -> bool:
    click_trans_id = params.get('click_trans_id')
    service_id = params.get('service_id')
    merchant_trans_id = params.get('merchant_trans_id')
    amount = params.get('amount')
    action = params.get('action')
    sign_time = params.get('sign_time')
    sign_string = params.get('sign_string')
    merchant_prepare_id = params.get('merchant_prepare_id')
    error = params.get('error')

    if not all([click_trans_id, service_id, merchant_trans_id, amount, str(action), sign_time, sign_string]):
        return False

    sign_payload = [
        str(click_trans_id),
        str(service_id),
        secret_key,
        str(merchant_trans_id),
        str(amount),
        str(action),
        str(sign_time),
    ]

    if merchant_prepare_id is not None:
        sign_payload.append(str(merchant_prepare_id))
    if error is not None:
        sign_payload.append(str(error))

    payload_str = "".join(sign_payload)
    expected = hashlib.md5(payload_str.encode('utf-8')).hexdigest()

    return expected.lower() == str(sign_string).lower()

def calculate_price(duration_minutes: float) -> int:
    """
    Pricing logic:
    - First 10 minutes of video is free.
    - Up to 30 minutes (10 < duration <= 30) costs 30,000 UZS.
    - Up to 60 minutes (30 < duration <= 60) costs 60,000 UZS.
    - Above 60 minutes: 1,000 UZS per minute.
    """
    if duration_minutes <= 10.0:
        base_amount = 0
    elif duration_minutes <= 30.0:
        base_amount = 30000
    elif duration_minutes <= 60.0:
        base_amount = 60000
    else:
        base_amount = math.ceil(duration_minutes) * 1000

    discounted_amount = Decimal(base_amount) * TEST_PRICE_MULTIPLIER
    return normalize_uzs_amount(discounted_amount)
