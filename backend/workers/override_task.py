"""Celery bazaviy klassi: admin tanlagan Gemini kalit turi/modelini ish bilan birga olib yuradi.

- apply_async: so'rov kontekstidagi tanlov (REQUEST_OVERRIDE) bo'lsa, task_id (= job/analysis ID) bo'yicha Redis'ga yoziladi.
- __call__: vazifa boshlanganda Redis'dan o'qilib faollashtiriladi, tugaganda (xato bo'lsa ham) tozalanadi.
Tanlov yo'q bo'lsa hech narsa o'zgarmaydi -- oddiy foydalanuvchilar uchun xatti-harakat avvalgidek.
"""
from celery import Task

from backend.services import gemini_quota_manager as gqm


class GeminiOverrideTask(Task):
    def apply_async(self, args=None, kwargs=None, task_id=None, **options):
        ov = gqm.REQUEST_OVERRIDE.get()
        if ov:
            key = task_id or (str(args[0]) if args else None)
            if key:
                gqm.save_job_gemini_override(str(key), ov)
        return super().apply_async(args=args, kwargs=kwargs, task_id=task_id, **options)

    def __call__(self, *args, **kwargs):
        job_key = None
        try:
            job_key = str(self.request.id or (args[0] if args else ""))
        except Exception:
            job_key = str(args[0]) if args else None
        gqm.activate_gemini_override(gqm.load_job_gemini_override(job_key) if job_key else None)
        try:
            return super().__call__(*args, **kwargs)
        finally:
            gqm.deactivate_gemini_override()
