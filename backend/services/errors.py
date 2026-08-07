class PermanentError(Exception):
    """Qayta urinish ma'nosiz bo'lgan xatolik — har safar bir xil natija
    chiqadi (masalan, video shaxsiy/o'chirilgan, yoki nutq topilmadi).
    Celery task retry mexanizmi buni ushlab, darhol FAILED qiladi."""
    pass
