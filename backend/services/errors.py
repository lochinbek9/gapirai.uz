class PermanentError(Exception):
    """Qayta urinish ma'nosiz bo'lgan xatolik — har safar bir xil natija
    chiqadi (masalan, video shaxsiy/o'chirilgan).
    Celery task retry mexanizmi buni ushlab, darhol FAILED qiladi.

    `code` — DubbingJob.error_code'ga yoziladigan qisqa toifa (masalan
    "VIDEO_UNAVAILABLE"). Berilmasa umumiy "PERMANENT" ishlatiladi.
    """

    def __init__(self, message: str, code: str = "PERMANENT"):
        super().__init__(message)
        self.code = code


class NoSpeechFoundError(Exception):
    """Foydalanuvchi yuborgan videoda inson nutqi yoki suhbat topilmaganda yuzaga keladi.
    Bu tizim nosozligi EMAS (foydalanuvchi ovozsiz yoki faqat musiqali video yuborgan),
    shuning uchun adminlarga xatolik signali yuborilmaydi va qayta urinish o'tkazilmaydi.
    """

    def __init__(self, message: str = "Bu videoda nutq topilmadi.", code: str = "NO_SPEECH_FOUND"):
        super().__init__(message)
        self.code = code
