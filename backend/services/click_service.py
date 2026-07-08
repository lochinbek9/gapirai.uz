import hashlib
import time
from urllib.parse import urlencode

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

def generate_digest(timestamp: int, secret_key: str) -> str:
    data = f"{timestamp}{secret_key}"
    return hashlib.sha1(data.encode('utf-8')).hexdigest()

def generate_payment_url(merchant_id: str, service_id: str, transaction_param: str, amount: float, return_url: str) -> str:
    params = {
        'service_id': service_id,
        'merchant_id': merchant_id,
        'amount': str(amount),
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

def calculate_price(duration_minutes: float) -> float:
    """
    10 minutes free then 1000 sums for every 10 minutes.
    """
    if duration_minutes <= 10.0:
        return 0.0
    
    extra_minutes = duration_minutes - 10.0
    import math
    blocks_of_10 = math.ceil(extra_minutes / 10.0)
    return blocks_of_10 * 1000.0
